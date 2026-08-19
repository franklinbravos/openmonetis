import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import type { ReviewExistingInstallmentCorrection } from "@/features/transactions/lib/import-amount-edit";
import {
	buildImportDuplicateValidation,
	type ImportDuplicateMatchOptions,
	type ImportDuplicateSnapshot,
} from "@/features/transactions/lib/import-duplicate-match";
import { isInvoiceExtraReviewRow } from "@/features/transactions/lib/import-invoice-extra-rows";
import { mapDuplicateSnapshotToExistingRow } from "@/features/transactions/lib/import-invoice-reconciliation";
import { detectInstallmentFromName } from "@/features/transactions/lib/installment-detection";
import type { InvoiceFileRowFingerprint } from "@/shared/lib/import/invoice-file-match";
import { pairInvoiceAgainstFile } from "@/shared/lib/import/invoice-pairing";

/**
 * Fechamento da fatura: transforma os pares da conciliação em estado da revisão.
 *
 * Depois desta passagem cada cadastro do período está conferido (com ajuste de
 * valor quando o arquivo diverge) ou sobrando, e cada linha do arquivo está
 * conferida ou entrando — que é o que faz o total projetado fechar com o total
 * do arquivo sem apagar e recadastrar o que só tem a descrição diferente.
 */

/** Linha do arquivo que participa do fechamento (pagamento e transferência ficam de fora). */
function isClosableFileRow(row: ReviewRow): boolean {
	return row.kind === "transaction" && !isInvoiceExtraReviewRow(row);
}

function fingerprintFromReviewRow(row: ReviewRow): InvoiceFileRowFingerprint {
	return {
		externalId: row.externalId,
		date: row.date,
		amount: Math.abs(row.amount),
		transactionType: row.transactionType,
		description: row.sourceDescription || row.description,
	};
}

/** N/M que a fatura declara para a linha, do parcelamento detectado ou do nome. */
function fileInstallment(
	row: ReviewRow,
): { currentInstallment: number; installmentCount: number } | null {
	if (
		row.installmentImport?.enabled &&
		row.installmentImport.currentInstallment &&
		row.installmentImport.installmentCount
	) {
		return {
			currentInstallment: row.installmentImport.currentInstallment,
			installmentCount: row.installmentImport.installmentCount,
		};
	}

	const detected = detectInstallmentFromName(
		row.sourceDescription || row.description,
	);
	if (!detected?.currentInstallment || !detected.installmentCount) return null;

	return {
		currentInstallment: detected.currentInstallment,
		installmentCount: detected.installmentCount,
	};
}

/**
 * Parcela cadastrada com o número errado: todas as ocorrências da série valem o
 * mesmo, então o par fecha pelo valor e o rótulo errado sobreviveria sozinho.
 * Só corrige o que já é série no cadastro — pôr número de parcela em lançamento
 * à vista sujaria o relatório de parcelas.
 */
function resolveInstallmentCorrection(
	row: ReviewRow,
	snapshot: ImportDuplicateSnapshot,
): ReviewExistingInstallmentCorrection | null {
	if (snapshot.installmentCount == null) return null;

	const fromFile = fileInstallment(row);
	if (!fromFile) return null;

	if (
		snapshot.currentInstallment === fromFile.currentInstallment &&
		snapshot.installmentCount === fromFile.installmentCount
	) {
		return null;
	}

	return { transactionId: snapshot.id, ...fromFile };
}

function snapshotAmount(snapshot: ImportDuplicateSnapshot): number {
	const numeric = Math.abs(Number(snapshot.amount));
	return Number.isFinite(numeric) ? numeric : 0;
}

export function applyInvoiceClosingToReviewRows(input: {
	rows: ReviewRow[];
	snapshots: ImportDuplicateSnapshot[];
	options?: ImportDuplicateMatchOptions;
}): ReviewRow[] {
	const { rows, snapshots } = input;
	if (snapshots.length === 0) return rows;

	const snapshotById = new Map(snapshots.map((item) => [item.id, item]));
	const periodSnapshotIds = new Set(snapshotById.keys());

	// Vínculo feito à mão manda: nem a linha nem o cadastro entram na conciliação.
	const manuallyClaimedIds = new Set<string>();
	for (const row of rows) {
		if (row.linked && row.linkedTransactionId) {
			manuallyClaimedIds.add(row.linkedTransactionId);
		}
	}

	const closableIndexes: number[] = [];
	rows.forEach((row, index) => {
		if (!isClosableFileRow(row)) return;
		if (row.linked || row.linkedTransactionId) return;
		closableIndexes.push(index);
	});

	const pairing = pairInvoiceAgainstFile(
		snapshots
			.filter((snapshot) => !manuallyClaimedIds.has(snapshot.id))
			.map(mapDuplicateSnapshotToExistingRow),
		closableIndexes.map((index) => fingerprintFromReviewRow(rows[index])),
	);

	const pairByRowIndex = new Map(
		pairing.pairs.map((pair) => [closableIndexes[pair.fileIndex], pair]),
	);

	return rows.map((row, index) => {
		const pair = pairByRowIndex.get(index);

		if (!pair) {
			// Sem par: se o casamento anterior tinha reivindicado um cadastro deste
			// período, ele agora pertence a outra linha — soltar, senão o cadastro
			// sumiria da conferência e o total não fecharia.
			const claimedId = row.duplicateValidation?.existingTransactionId;
			if (
				isClosableFileRow(row) &&
				!row.linked &&
				claimedId &&
				periodSnapshotIds.has(claimedId)
			) {
				return {
					...row,
					isDuplicate: false,
					duplicateValidation: null,
					existingAmount: null,
					existingAmountCorrection: null,
					existingInstallmentCorrection: null,
					selected: true,
				};
			}

			return row;
		}

		const snapshot = snapshotById.get(pair.registered.id);
		if (!snapshot) return row;

		const existingAmount = snapshotAmount(snapshot);
		const needsAmountFix = pair.signedDelta !== 0;

		return {
			...row,
			isDuplicate: true,
			// "mismatch" e não "link_suggestion": o par já está decidido, o que falta
			// é só acertar o valor — sugestão de vínculo sairia da conferência e
			// bloquearia a correção automática.
			duplicateValidation: buildImportDuplicateValidation(
				row,
				snapshot,
				needsAmountFix ? "mismatch" : "match",
				input.options,
			),
			existingAmount,
			existingAmountCorrection: needsAmountFix
				? { transactionId: snapshot.id, amount: Math.abs(row.amount) }
				: null,
			existingInstallmentCorrection: resolveInstallmentCorrection(
				row,
				snapshot,
			),
			selected: false,
			categoryId: row.categoryId ?? snapshot.categoryId,
			payerId: row.payerId ?? snapshot.payerId,
		};
	});
}
