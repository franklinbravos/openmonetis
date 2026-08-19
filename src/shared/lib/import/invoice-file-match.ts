import { normalizeImportedText } from "@/shared/lib/import/helpers";
import {
	type InvoiceReconciliationExistingRow,
	isInvoicePaymentDescription,
	shouldIncludeExistingInInvoiceTotal,
	signedAmountFromReviewValues,
	signedAmountFromStoredValue,
} from "@/shared/lib/import/invoice-total";
import type {
	ImportedTransaction,
	ImportStatement,
} from "@/shared/lib/import/types";
import { detectInstallmentFromName } from "@/shared/utils/installment-detection";

export type InvoiceFileRowFingerprint = {
	externalId: string | null;
	date: string;
	amount: number;
	transactionType: "income" | "expense";
	description: string;
};

function normalizeMatchName(value: string): string {
	return normalizeImportedText(value).toLowerCase();
}

/**
 * Nome base sem o sufixo de parcela ("- Parcela 6/10", "(3/5)" etc.).
 *
 * O cadastro guarda só o nome da compra; o arquivo traz o nome com a parcela
 * anexada. Comparar as strings cruas nunca bate para nenhuma parcela — todo
 * lançamento parcelado cadastrado aparecia como "a mais no OpenMonetis" e como
 * se estivesse "ausente do arquivo importado", quando as duas pontas tinham a
 * mesma linha, só com o nome escrito de formas diferentes.
 */
function normalizeMatchBaseName(value: string): string {
	const detected = detectInstallmentFromName(value);
	return normalizeMatchName(detected?.name ?? value);
}

function amountCentsFromSigned(signed: number): number {
	return Math.round(signed * 100);
}

export function sourceFileRowsFromTransactions(
	transactions: ImportedTransaction[],
): InvoiceFileRowFingerprint[] {
	return transactions
		.filter(
			(transaction) => !isInvoicePaymentDescription(transaction.description),
		)
		.map((transaction) => ({
			externalId: transaction.externalId,
			date: transaction.date,
			amount: Math.abs(transaction.amount),
			transactionType: transaction.transactionType,
			description: transaction.description,
		}));
}

export function sourceFileRowsFromStatement(
	statement: ImportStatement,
): InvoiceFileRowFingerprint[] {
	return sourceFileRowsFromTransactions(statement.transactions);
}

export function parseStoredSourceFileRows(
	value: unknown,
): InvoiceFileRowFingerprint[] {
	if (!Array.isArray(value)) return [];

	const rows: InvoiceFileRowFingerprint[] = [];

	for (const item of value) {
		if (!item || typeof item !== "object") continue;

		const row = item as Partial<InvoiceFileRowFingerprint>;
		if (typeof row.date !== "string" || typeof row.description !== "string") {
			continue;
		}

		const amount = Number(row.amount);
		if (!Number.isFinite(amount) || amount <= 0) continue;
		if (row.transactionType !== "income" && row.transactionType !== "expense") {
			continue;
		}

		rows.push({
			externalId:
				typeof row.externalId === "string" && row.externalId.length > 0
					? row.externalId
					: null,
			date: row.date,
			amount,
			transactionType: row.transactionType,
			description: row.description,
		});
	}

	return rows;
}

export function findRegisteredRowsMissingFromFile(
	registeredRows: InvoiceReconciliationExistingRow[],
	fileRows: InvoiceFileRowFingerprint[],
): InvoiceReconciliationExistingRow[] {
	const invoiceRegisteredRows = registeredRows.filter(
		shouldIncludeExistingInInvoiceTotal,
	);
	const unusedFileIndexes = new Set(fileRows.map((_, index) => index));

	function consumeFileMatch(
		predicate: (fileRow: InvoiceFileRowFingerprint) => boolean,
	): boolean {
		for (const index of unusedFileIndexes) {
			const fileRow = fileRows[index];
			if (!fileRow || !predicate(fileRow)) continue;
			unusedFileIndexes.delete(index);
			return true;
		}

		return false;
	}

	const extras: InvoiceReconciliationExistingRow[] = [];

	for (const registered of invoiceRegisteredRows) {
		const registeredSigned = signedAmountFromStoredValue(
			registered.amount,
			registered.transactionType,
		);
		const registeredCents = amountCentsFromSigned(registeredSigned);
		const registeredName = normalizeMatchName(registered.name);

		const matchedByExternalId =
			Boolean(registered.ofxFitId) &&
			consumeFileMatch(
				(fileRow) =>
					Boolean(fileRow.externalId) &&
					fileRow.externalId === registered.ofxFitId,
			);

		if (matchedByExternalId) continue;

		const registeredBaseName = normalizeMatchBaseName(registered.name);

		const matchedByNameAndAmount = consumeFileMatch((fileRow) => {
			const fileSigned = signedAmountFromReviewValues(
				fileRow.amount,
				fileRow.transactionType,
			);
			if (amountCentsFromSigned(fileSigned) !== registeredCents) return false;

			const fileName = normalizeMatchName(fileRow.description);
			if (fileName === registeredName) return true;

			return normalizeMatchBaseName(fileRow.description) === registeredBaseName;
		});

		if (matchedByNameAndAmount) continue;

		extras.push(registered);
	}

	return extras;
}
