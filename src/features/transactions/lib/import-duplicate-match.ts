import type { ReviewInstallmentImport } from "@/features/transactions/lib/import-installments";
import {
	parseInvoicePaymentNoteCardId,
	parseInvoicePaymentNotePeriod,
} from "@/shared/lib/accounts/constants";
import {
	buildImportTransactionFingerprint,
	importExternalIdCollidesWithStored,
	importExternalIdsPointToSameCharge,
	stripImportExternalIdSuffix,
} from "@/shared/lib/import/helpers";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly, toDateOnlyString } from "@/shared/utils/date";
import { detectInstallmentFromName } from "@/shared/utils/installment-detection";

export type ImportDuplicateSnapshot = {
	id: string;
	ofxFitId: string | null;
	name: string;
	amount: string;
	purchaseDate: Date | string;
	transactionType: string;
	currentInstallment: number | null;
	installmentCount: number | null;
	payerId: string | null;
	categoryId: string | null;
	period?: string | null;
	condition?: string | null;
	recurrenceCount?: number | null;
	/** Anotação do cadastro: é ela que diz a qual fatura um pagamento pertence. */
	note?: string | null;
};

export type ImportDuplicateMatchOptions = {
	invoicePeriods?: string[];
	/** Lançamentos já vinculados nesta revisão não devem voltar como candidatos. */
	excludeExistingTransactionIds?: ReadonlySet<string>;
};

export function collectImportLinkedExistingTransactionIds(
	rows: Array<{
		linked?: boolean;
		linkedTransactionId?: string | null;
		duplicateValidation?: ImportDuplicateValidation | null;
	}>,
): Set<string> {
	const ids = new Set<string>();

	for (const row of rows) {
		if (!row.linked) continue;

		if (row.linkedTransactionId) {
			ids.add(row.linkedTransactionId);
			continue;
		}

		if (row.duplicateValidation?.existingTransactionId) {
			ids.add(row.duplicateValidation.existingTransactionId);
		}
	}

	return ids;
}

export function mergeImportDuplicateSnapshots(
	...lists: ImportDuplicateSnapshot[][]
): ImportDuplicateSnapshot[] {
	const byId = new Map<string, ImportDuplicateSnapshot>();

	for (const list of lists) {
		for (const snapshot of list) {
			byId.set(snapshot.id, snapshot);
		}
	}

	return [...byId.values()];
}

export type ImportDuplicateField =
	| "date"
	| "amount"
	| "description"
	| "type"
	| "installment";

export type ImportDuplicateMismatch = {
	field: ImportDuplicateField;
	label: string;
	imported: string;
	existing: string;
};

export type ImportDuplicateStatus = "match" | "mismatch" | "link_suggestion";

export type ImportMatchScore = {
	date: boolean;
	amount: boolean;
	description: boolean;
};

export type ImportDuplicateValidation = {
	status: ImportDuplicateStatus;
	matchScore: ImportMatchScore;
	mismatches: ImportDuplicateMismatch[];
	existingTransactionId: string;
	existingPayerId: string | null;
	existingCategoryId: string | null;
	/** Fatura em que o cadastro casado está, para o usuário saber de onde ele veio. */
	existingPeriod?: string | null;
	/** Nome do cadastro casado — costuma diferir do nome da maquininha. */
	existingName?: string;
	/** Parcela do cadastro casado, no formato "1/5". */
	existingInstallmentLabel?: string | null;
	/**
	 * Fatura que o pagamento já cadastrado liquida, lida da anotação.
	 *
	 * Numa linha conferida o que vale é o vínculo registrado, não o palpite da
	 * importação: é ele que o usuário precisa ver para saber se está certo.
	 */
	existingInvoiceCardId?: string | null;
	existingInvoicePeriod?: string | null;
};

type ImportRowForMatch = Pick<
	ImportedTransaction,
	"date" | "amount" | "description" | "transactionType"
> & {
	installmentImport?: ReviewInstallmentImport | null;
};

type MatchIdentity = {
	baseName: string;
	currentInstallment: number | null;
	installmentCount: number | null;
};

function normalizeDescription(value: string): string {
	return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function resolveImportMatchIdentity(row: ImportRowForMatch): MatchIdentity {
	if (row.installmentImport?.enabled) {
		return {
			baseName: normalizeDescription(row.installmentImport.name),
			currentInstallment: row.installmentImport.currentInstallment,
			installmentCount: row.installmentImport.installmentCount,
		};
	}

	const detected = detectInstallmentFromName(row.description);
	if (detected) {
		return {
			baseName: normalizeDescription(detected.name),
			currentInstallment: detected.currentInstallment,
			installmentCount: detected.installmentCount,
		};
	}

	return {
		baseName: normalizeDescription(row.description),
		currentInstallment: null,
		installmentCount: null,
	};
}

function resolveExistingMatchIdentity(
	existing: ImportDuplicateSnapshot,
): MatchIdentity {
	const detected = detectInstallmentFromName(existing.name);
	if (detected) {
		return {
			baseName: normalizeDescription(detected.name),
			currentInstallment: detected.currentInstallment,
			installmentCount: detected.installmentCount,
		};
	}

	if (existing.currentInstallment && existing.installmentCount) {
		return {
			baseName: normalizeDescription(existing.name),
			currentInstallment: existing.currentInstallment,
			installmentCount: existing.installmentCount,
		};
	}

	return {
		baseName: normalizeDescription(existing.name),
		currentInstallment: null,
		installmentCount: null,
	};
}

function installmentsAreCompatible(
	imported: MatchIdentity,
	existing: MatchIdentity,
): boolean {
	const importedHas =
		imported.currentInstallment != null && imported.installmentCount != null;
	const existingHas =
		existing.currentInstallment != null && existing.installmentCount != null;

	if (!importedHas || !existingHas) {
		return true;
	}

	return (
		imported.currentInstallment === existing.currentInstallment &&
		imported.installmentCount === existing.installmentCount
	);
}

/** Mesma parcela da série (nome base + N/M). */
function hasMatchingInstallmentParcel(
	imported: MatchIdentity,
	existing: MatchIdentity,
): boolean {
	return (
		imported.currentInstallment != null &&
		imported.installmentCount != null &&
		existing.currentInstallment != null &&
		existing.installmentCount != null &&
		imported.baseName === existing.baseName &&
		imported.currentInstallment === existing.currentInstallment &&
		imported.installmentCount === existing.installmentCount
	);
}

/**
 * Duplicata de parcela: nome + N/M + valor.
 * A data do extrato NÃO entra — bancos como Nubank reescrevem a data a cada
 * abertura de fatura, então ela não é sinal confiável entre faturas.
 */
function isSameInvoicePeriodCandidate(
	existing: ImportDuplicateSnapshot,
	options?: ImportDuplicateMatchOptions,
): boolean {
	if (!existing.period || !options?.invoicePeriods?.length) {
		return false;
	}

	return options.invoicePeriods.includes(existing.period);
}

/** Cadastro que sabidamente pertence a outra fatura (período conhecido e fora do importado). */
function isKnownOtherInvoicePeriodCandidate(
	existing: ImportDuplicateSnapshot,
	options?: ImportDuplicateMatchOptions,
): boolean {
	if (!existing.period || !options?.invoicePeriods?.length) {
		return false;
	}

	return !options.invoicePeriods.includes(existing.period);
}

/**
 * À vista na mesma fatura: nome + valor bastam (data do banco pode mudar).
 */
function isSameInvoicePeriodFlatDuplicate(
	row: ImportRowForMatch,
	existing: ImportDuplicateSnapshot,
	options?: ImportDuplicateMatchOptions,
): boolean {
	if (!isSameInvoicePeriodCandidate(existing, options)) {
		return false;
	}

	if (
		!amountsMatchForImportDuplicate(
			row.transactionType,
			row.amount,
			existing.transactionType,
			Number(existing.amount),
		)
	) {
		return false;
	}

	const importedIdentity = resolveImportMatchIdentity(row);
	const existingIdentity = resolveExistingMatchIdentity(existing);

	const importedHasParcel =
		importedIdentity.currentInstallment != null &&
		importedIdentity.installmentCount != null;
	const existingHasParcel =
		existingIdentity.currentInstallment != null &&
		existingIdentity.installmentCount != null;

	if (importedHasParcel || existingHasParcel) {
		return false;
	}

	return importedIdentity.baseName === existingIdentity.baseName;
}

function isInstallmentParcelDuplicate(
	row: ImportRowForMatch,
	existing: ImportDuplicateSnapshot,
	options?: ImportDuplicateMatchOptions,
): boolean {
	const importedIdentity = resolveImportMatchIdentity(row);
	const existingIdentity = resolveExistingMatchIdentity(existing);

	if (
		!amountsMatchForImportDuplicate(
			row.transactionType,
			row.amount,
			existing.transactionType,
			Number(existing.amount),
		)
	) {
		return false;
	}

	if (hasMatchingInstallmentParcel(importedIdentity, existingIdentity)) {
		return true;
	}

	const importedHasParcel =
		importedIdentity.currentInstallment != null &&
		importedIdentity.installmentCount != null;
	const existingHasParcel =
		existingIdentity.currentInstallment != null &&
		existingIdentity.installmentCount != null;

	// Cadastro à vista na fatura (sem N/M no banco): mesmo nome + valor.
	// Parcelas da mesma compra repetem nome base e valor, então esse par só vale
	// dentro da fatura importada: cruzar períodos casaria a parcela de fevereiro
	// com a de junho da mesma série.
	if (importedHasParcel && !existingHasParcel) {
		return (
			importedIdentity.baseName === existingIdentity.baseName &&
			!isKnownOtherInvoicePeriodCandidate(existing, options)
		);
	}

	// Lançamento anotado manualmente na fatura importada: aceita nome + valor
	// na mesma fatura mesmo quando o N/M do cadastro diverge do extrato.
	if (
		importedHasParcel &&
		importedIdentity.baseName === existingIdentity.baseName &&
		isSameInvoicePeriodCandidate(existing, options)
	) {
		return true;
	}

	return false;
}

function getImportedDescriptionForMatch(row: ImportRowForMatch): string {
	return resolveImportMatchIdentity(row).baseName;
}

const TRANSFER_TRANSACTION_TYPE = "Transferência";

function mapDbTransactionType(value: string): "income" | "expense" {
	return value === "Receita" ? "income" : "expense";
}

function isTransferDbTransactionType(value: string): boolean {
	return value === TRANSFER_TRANSACTION_TYPE;
}

function amountsMatchForImportDuplicate(
	importedType: "income" | "expense",
	importedAmount: number,
	existingType: string,
	existingAmount: number,
): boolean {
	const normalizedExistingAmount = Math.abs(existingAmount);
	if (Math.abs(importedAmount - normalizedExistingAmount) > 0.009) {
		return false;
	}

	if (isTransferDbTransactionType(existingType)) {
		return true;
	}

	return importedType === mapDbTransactionType(existingType);
}

function formatTransactionTypeLabel(type: "income" | "expense"): string {
	return type === "income" ? "Receita" : "Despesa";
}

function formatInstallmentLabel(
	current: number | null,
	total: number | null,
): string | null {
	if (!current || !total) return null;
	return `${current}/${total}`;
}

export function scoreImportAgainstSnapshot(
	row: ImportRowForMatch,
	existing: ImportDuplicateSnapshot,
): ImportMatchScore {
	const importedDate = row.date;
	const existingDate = toDateOnlyString(existing.purchaseDate);
	const importedType = row.transactionType;
	const importedAmount = row.amount;
	const importedIdentity = resolveImportMatchIdentity(row);
	const existingIdentity = resolveExistingMatchIdentity(existing);

	return {
		date: Boolean(
			importedDate && existingDate && importedDate === existingDate,
		),
		amount: amountsMatchForImportDuplicate(
			importedType,
			importedAmount,
			existing.transactionType,
			Number(existing.amount),
		),
		description:
			importedIdentity.baseName === existingIdentity.baseName &&
			installmentsAreCompatible(importedIdentity, existingIdentity),
	};
}

export function countImportMatchScore(score: ImportMatchScore): number {
	return Number(score.date) + Number(score.amount) + Number(score.description);
}

/** Score efetivo: parcela N/M + valor ou nome+valor na mesma fatura contam como match completo. */
function effectiveImportMatchScore(
	row: ImportRowForMatch,
	existing: ImportDuplicateSnapshot,
	score: ImportMatchScore,
	options?: ImportDuplicateMatchOptions,
): number {
	if (isInstallmentParcelDuplicate(row, existing, options)) {
		return 3;
	}
	if (isSameInvoicePeriodFlatDuplicate(row, existing, options)) {
		return 3;
	}
	return countImportMatchScore(score);
}

function linkSuggestionPriority(score: ImportMatchScore): number {
	if (score.date && score.amount) return 3;
	if (score.date && score.description) return 2;
	if (score.amount && score.description) return 1;
	return 0;
}

export function findSemanticDuplicateSnapshot(
	row: ImportRowForMatch,
	candidates: ImportDuplicateSnapshot[],
	options?: ImportDuplicateMatchOptions,
): ImportDuplicateSnapshot | null {
	for (const existing of candidates) {
		const score = scoreImportAgainstSnapshot(row, existing);
		if (effectiveImportMatchScore(row, existing, score, options) === 3) {
			return existing;
		}
	}

	return null;
}

export function findInstallmentDuplicateSnapshot(
	row: ImportRowForMatch,
	candidates: ImportDuplicateSnapshot[],
	options?: ImportDuplicateMatchOptions,
): ImportDuplicateSnapshot | null {
	for (const existing of candidates) {
		if (isInstallmentParcelDuplicate(row, existing, options)) {
			return existing;
		}
	}

	return null;
}

export function buildImportDuplicateValidation(
	row: ImportRowForMatch,
	existing: ImportDuplicateSnapshot,
	forcedStatus?: ImportDuplicateStatus,
	options?: ImportDuplicateMatchOptions,
): ImportDuplicateValidation {
	const matchScore = scoreImportAgainstSnapshot(row, existing);
	const mismatches: ImportDuplicateMismatch[] = [];
	const installmentParcelDuplicate = isInstallmentParcelDuplicate(
		row,
		existing,
		options,
	);
	const sameInvoiceFlatDuplicate = isSameInvoicePeriodFlatDuplicate(
		row,
		existing,
		options,
	);

	const importedDate = row.date;
	const existingDate = toDateOnlyString(existing.purchaseDate);
	const importedIdentity = resolveImportMatchIdentity(row);
	const existingIdentity = resolveExistingMatchIdentity(existing);

	// Data diverge com frequência entre faturas (ex.: Nubank). Em parcela
	// já identificada por nome+N/M+valor, não reportar como divergência.
	// Série parcelada guarda uma única data de compra em todas as ocorrências, então
	// comparar com a data da linha da fatura acusa uma divergência que não existe —
	// e dava a impressão de que o casamento tinha ido buscar outro mês.
	const existingIsInstallmentOccurrence = existing.installmentCount != null;

	if (
		importedDate &&
		existingDate &&
		importedDate !== existingDate &&
		!installmentParcelDuplicate &&
		!sameInvoiceFlatDuplicate &&
		!existingIsInstallmentOccurrence
	) {
		mismatches.push({
			field: "date",
			label: "Data",
			imported: formatDateOnly(importedDate) ?? importedDate,
			existing: formatDateOnly(existingDate) ?? existingDate,
		});
	}

	const importedAmount = row.amount;
	const existingAmount = Math.abs(Number(existing.amount));
	if (Math.abs(importedAmount - existingAmount) > 0.009) {
		mismatches.push({
			field: "amount",
			label: "Valor",
			imported: formatCurrency(importedAmount),
			existing: formatCurrency(existingAmount),
		});
	}

	const importedType = row.transactionType;
	const existingType = mapDbTransactionType(existing.transactionType);
	if (
		!isTransferDbTransactionType(existing.transactionType) &&
		importedType !== existingType
	) {
		mismatches.push({
			field: "type",
			label: "Tipo",
			imported: formatTransactionTypeLabel(importedType),
			existing: formatTransactionTypeLabel(existingType),
		});
	}

	if (importedIdentity.baseName !== existingIdentity.baseName) {
		mismatches.push({
			field: "description",
			label: "Descrição",
			imported: getImportedDescriptionForMatch(row).trim(),
			existing: existingIdentity.baseName,
		});
	}

	if (row.installmentImport?.enabled) {
		const importedInstallment = formatInstallmentLabel(
			importedIdentity.currentInstallment,
			importedIdentity.installmentCount,
		);
		const existingInstallment = formatInstallmentLabel(
			existingIdentity.currentInstallment,
			existingIdentity.installmentCount,
		);

		if (
			importedInstallment &&
			existingInstallment &&
			importedInstallment !== existingInstallment
		) {
			mismatches.push({
				field: "installment",
				label: "Parcela",
				imported: importedInstallment,
				existing: existingInstallment,
			});
		}
	}

	let status: ImportDuplicateStatus;
	if (forcedStatus) {
		status = forcedStatus;
	} else if (
		(installmentParcelDuplicate || sameInvoiceFlatDuplicate) &&
		mismatches.length === 0
	) {
		status = "match";
	} else if (
		countImportMatchScore(matchScore) === 3 &&
		mismatches.length === 0
	) {
		status = "match";
	} else if (
		installmentParcelDuplicate ||
		sameInvoiceFlatDuplicate ||
		countImportMatchScore(matchScore) === 3
	) {
		status = "mismatch";
	} else {
		status = "link_suggestion";
	}

	return {
		status,
		matchScore: installmentParcelDuplicate
			? { date: true, amount: true, description: true }
			: matchScore,
		mismatches,
		existingTransactionId: existing.id,
		existingPayerId: existing.payerId,
		existingCategoryId: existing.categoryId,
		existingPeriod: existing.period ?? null,
		existingName: existing.name,
		existingInstallmentLabel: formatInstallmentLabel(
			existing.currentInstallment,
			existing.installmentCount,
		),
		existingInvoiceCardId: parseInvoicePaymentNoteCardId(existing.note),
		existingInvoicePeriod: parseInvoicePaymentNotePeriod(existing.note),
	};
}

export type ResolvedImportSemanticMatch = {
	existing: ImportDuplicateSnapshot;
	validation: ImportDuplicateValidation;
};

function resolveExistingSnapshotForExternalId(
	externalId: string | null | undefined,
	duplicateSnapshotByFitId: Map<string, ImportDuplicateSnapshot>,
): ImportDuplicateSnapshot | undefined {
	if (!externalId) return undefined;

	return (
		duplicateSnapshotByFitId.get(externalId) ??
		duplicateSnapshotByFitId.get(stripImportExternalIdSuffix(externalId))
	);
}

/**
 * Nubank (e possivelmente outros bancos) reaproveita o mesmo FITID em todas as
 * parcelas de uma compra parcelada — o identificador é da COMPRA, não da
 * cobrança do mês. Um FITID batendo com o cadastro não garante que seja a MESMA
 * ocorrência: pode ser outra parcela da mesma série, de um mês que nunca foi
 * importado. Só confia no FITID quando nenhum dos dois lados é parcela, ou
 * quando os dois lados concordam no N/M — senão a checagem cai para o matching
 * por período, que sabe separar as ocorrências corretamente.
 */
function fitIdMatchIsReliable(
	row: ImportRowForMatch,
	existing: ImportDuplicateSnapshot,
): boolean {
	const importedIdentity = resolveImportMatchIdentity(row);
	const existingIdentity = resolveExistingMatchIdentity(existing);

	const importedHasParcel =
		importedIdentity.currentInstallment != null &&
		importedIdentity.installmentCount != null;
	const existingHasParcel =
		existingIdentity.currentInstallment != null &&
		existingIdentity.installmentCount != null;

	if (!importedHasParcel || !existingHasParcel) {
		return true;
	}

	return (
		importedIdentity.currentInstallment ===
			existingIdentity.currentInstallment &&
		importedIdentity.installmentCount === existingIdentity.installmentCount
	);
}

function resolveWithinFileDuplicateStates(
	rows: Array<
		ImportRowForMatch & {
			externalId?: string | null;
			linked?: boolean;
			linkedTransactionId?: string | null;
		}
	>,
	states: Array<{
		isDuplicate: boolean;
		duplicateValidation: ImportDuplicateValidation | null;
	}>,
): Array<{
	isDuplicate: boolean;
	duplicateValidation: ImportDuplicateValidation | null;
}> {
	const firstByFingerprint = new Map<
		string,
		{ index: number; externalId: string | null }
	>();

	return states.map((state, index) => {
		const row = rows[index];
		if (!row || state.isDuplicate || row.linked || row.linkedTransactionId) {
			return state;
		}

		const fingerprint = buildImportTransactionFingerprint({
			date: row.date,
			amount: row.amount,
			description: row.description,
			transactionType: row.transactionType,
		});
		const externalId = row.externalId ?? null;

		const first = firstByFingerprint.get(fingerprint);
		if (!first) {
			firstByFingerprint.set(fingerprint, { index, externalId });
			return state;
		}

		// Duas linhas com o mesmo fingerprint são cobranças distintas quando os
		// identificadores apontam para cobranças diferentes — inclusive quando
		// diferem só no sufixo de um id sintético, que é o caso de dois pedágios
		// no mesmo dia pelo mesmo valor. Comparar apenas a base colapsava a
		// segunda e abria no total projetado um furo do valor dela.
		//
		// O fingerprint decide quando falta identificador por linha, ou quando o
		// id do arquivo vem repetido — aí é o parser emitindo a mesma transação
		// duas vezes.
		if (
			externalId &&
			first.externalId &&
			!importExternalIdsPointToSameCharge(externalId, first.externalId, {
				sameFile: true,
			})
		) {
			return state;
		}

		const firstState = states[first.index];
		if (firstState.isDuplicate && firstState.duplicateValidation) {
			return {
				isDuplicate: true,
				duplicateValidation: firstState.duplicateValidation,
			};
		}

		return {
			isDuplicate: true,
			duplicateValidation: null,
		};
	});
}

export function resolveImportDuplicateMatches(
	rows: Array<
		ImportRowForMatch & {
			externalId?: string | null;
			linked?: boolean;
			linkedTransactionId?: string | null;
		}
	>,
	input: {
		candidates: ImportDuplicateSnapshot[];
		fitIdDuplicateIds: Set<string>;
		duplicateSnapshotByFitId: Map<string, ImportDuplicateSnapshot>;
		options?: ImportDuplicateMatchOptions;
	},
): Array<{
	isDuplicate: boolean;
	duplicateValidation: ImportDuplicateValidation | null;
}> {
	const linkedExistingIds = collectImportLinkedExistingTransactionIds(rows);
	const matchOptions: ImportDuplicateMatchOptions = {
		...input.options,
		excludeExistingTransactionIds: new Set([
			...(input.options?.excludeExistingTransactionIds ?? []),
			...linkedExistingIds,
		]),
	};

	const semanticMatches = resolveSemanticImportMatches(
		rows,
		input.candidates,
		matchOptions,
	);
	const installmentDuplicateByIndex = new Map(
		rows.flatMap((row, rowIndex) => {
			const match = findInstallmentDuplicateSnapshot(
				row,
				input.candidates,
				input.options,
			);
			return match ? [[rowIndex, match] as const] : [];
		}),
	);

	const mappedStates = rows.map((row, index) => {
		if (row.linked || row.linkedTransactionId) {
			return { isDuplicate: false, duplicateValidation: null };
		}

		const isDuplicateByFitId = row.externalId
			? importExternalIdCollidesWithStored(
					row.externalId,
					input.fitIdDuplicateIds,
				)
			: false;
		const existingSnapshot = resolveExistingSnapshotForExternalId(
			row.externalId,
			input.duplicateSnapshotByFitId,
		);
		let isDuplicate =
			isDuplicateByFitId &&
			(!existingSnapshot || fitIdMatchIsReliable(row, existingSnapshot));
		let duplicateValidation: ImportDuplicateValidation | null = null;

		if (isDuplicate && existingSnapshot) {
			duplicateValidation = buildImportDuplicateValidation(
				row,
				existingSnapshot,
				"match",
				input.options,
			);
		} else {
			const installmentDuplicate = installmentDuplicateByIndex.get(index);
			if (installmentDuplicate) {
				duplicateValidation = buildImportDuplicateValidation(
					row,
					installmentDuplicate,
					undefined,
					input.options,
				);
				isDuplicate = true;
			} else {
				const semanticMatch = semanticMatches.get(index);
				if (semanticMatch) {
					duplicateValidation = semanticMatch.validation;
					if (semanticMatch.validation.status !== "link_suggestion") {
						isDuplicate = true;
					}
				}
			}
		}

		return { isDuplicate, duplicateValidation };
	});

	return resolveWithinFileDuplicateStates(rows, mappedStates);
}

export function resolveSemanticImportMatches(
	rows: ImportRowForMatch[],
	candidates: ImportDuplicateSnapshot[],
	options?: ImportDuplicateMatchOptions,
): Map<number, ResolvedImportSemanticMatch> {
	const results = new Map<number, ResolvedImportSemanticMatch>();
	if (rows.length === 0 || candidates.length === 0) return results;

	const scoreMatrix = rows.map((row) =>
		candidates.map((candidate) => scoreImportAgainstSnapshot(row, candidate)),
	);

	const effectiveScoreMatrix = rows.map((row, rowIndex) =>
		candidates.map((candidate, candidateIndex) =>
			effectiveImportMatchScore(
				row,
				candidate,
				scoreMatrix[rowIndex][candidateIndex],
				options,
			),
		),
	);

	const candidateHasPerfectMatchInFile = candidates.map((_, candidateIndex) =>
		effectiveScoreMatrix.some((rowScores) => rowScores[candidateIndex] === 3),
	);

	const claimedExistingIds = new Set<string>(
		options?.excludeExistingTransactionIds ?? [],
	);

	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex];
		let bestCandidateIndex: number | null = null;
		let bestScore = 0;
		let bestPriority = -1;

		for (
			let candidateIndex = 0;
			candidateIndex < candidates.length;
			candidateIndex++
		) {
			const existing = candidates[candidateIndex];
			if (claimedExistingIds.has(existing.id)) {
				continue;
			}

			const score = scoreMatrix[rowIndex][candidateIndex];
			const total = effectiveScoreMatrix[rowIndex][candidateIndex];
			if (total < 2) continue;

			if (total === 3) {
				if (bestScore < 3) {
					bestCandidateIndex = candidateIndex;
					bestScore = 3;
					bestPriority = 99;
				}
				continue;
			}

			if (candidateHasPerfectMatchInFile[candidateIndex]) {
				continue;
			}

			const priority = linkSuggestionPriority(score);
			if (
				bestScore < 3 &&
				(bestCandidateIndex === null ||
					priority > bestPriority ||
					(priority === bestPriority && bestScore < 2))
			) {
				bestCandidateIndex = candidateIndex;
				bestScore = 2;
				bestPriority = priority;
			}
		}

		if (bestCandidateIndex === null) continue;

		const existing = candidates[bestCandidateIndex];
		if (claimedExistingIds.has(existing.id)) {
			continue;
		}

		const validation = buildImportDuplicateValidation(
			row,
			existing,
			bestScore === 2 ? "link_suggestion" : undefined,
			options,
		);

		if (
			validation.status === "link_suggestion" &&
			claimedExistingIds.has(existing.id)
		) {
			continue;
		}

		results.set(rowIndex, { existing, validation });

		if (validation.status === "link_suggestion") {
			claimedExistingIds.add(existing.id);
		}
	}

	return results;
}

export function isImportLinkSuggestion(row: {
	duplicateValidation: ImportDuplicateValidation | null;
	reimported?: boolean;
	linked?: boolean;
}): boolean {
	return (
		row.duplicateValidation?.status === "link_suggestion" &&
		!row.reimported &&
		!row.linked
	);
}

export function isImportRowLinked(row: { linked?: boolean }): boolean {
	return row.linked === true;
}

export function isVerifiedImportDuplicate(row: {
	isDuplicate: boolean;
	duplicateValidation: ImportDuplicateValidation | null;
	reimported?: boolean;
	linked?: boolean;
}): boolean {
	return (
		row.isDuplicate &&
		row.duplicateValidation?.status === "match" &&
		!row.reimported &&
		!row.linked
	);
}

export function isImportRowResolved(row: {
	isDuplicate: boolean;
	duplicateValidation: ImportDuplicateValidation | null;
	reimported?: boolean;
	linked?: boolean;
}): boolean {
	return isVerifiedImportDuplicate(row) || isImportRowLinked(row);
}
