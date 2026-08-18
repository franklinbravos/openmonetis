import { INVOICE_ADJUSTMENT_NAME } from "@/shared/lib/accounts/constants";
import { findRegisteredRowsMissingFromFile } from "@/shared/lib/import/invoice-file-match";
import type { ImportedTransaction } from "@/shared/lib/import/types";

const INVOICE_PAYMENT_DESCRIPTION_PATTERNS = [
	/pgto\s+fatura/i,
	/pagamento\s+(efetuado\s+)?pagamento\s+fatura/i,
	/^pagamento\s+fatura/i,
	/pagto\s+fatura/i,
	/^pagamento\s+recebido$/i,
];

export type InvoiceReconciliationRowKind =
	| "transaction"
	| "invoice_payment"
	| "transfer"
	| "invoice_extra";

export type InvoiceReconciliationReviewRow = {
	externalId: string | null;
	amount: number;
	transactionType: "income" | "expense";
	kind: InvoiceReconciliationRowKind;
	selected: boolean;
	isDuplicate: boolean;
	reimported?: boolean;
	linked?: boolean;
	description: string;
	date: string;
	existingTransactionId?: string | null;
};

export type InvoiceReconciliationExistingRow = {
	id: string;
	ofxFitId: string | null;
	name: string;
	amount: string | number;
	transactionType: string;
	purchaseDate?: string | Date | null;
};

export type InvoiceReconciliationAmountMismatch = {
	existingId: string;
	externalId: string;
	name: string;
	existingSignedAmount: number;
	fileSignedAmount: number;
	signedDelta: number;
};

export type InvoiceReconciliationMissingFileRow =
	InvoiceReconciliationReviewRow & {
		reason: "not_registered" | "not_selected";
	};

export function isInvoicePaymentDescription(description: string): boolean {
	const normalized = description.trim();
	return INVOICE_PAYMENT_DESCRIPTION_PATTERNS.some((pattern) =>
		pattern.test(normalized),
	);
}

export function signedAmountFromReviewValues(
	amount: number,
	transactionType: "income" | "expense",
): number {
	return transactionType === "expense" ? -Math.abs(amount) : Math.abs(amount);
}

export function signedAmountFromStoredValue(
	amount: string | number,
	transactionType: string,
): number {
	const numeric =
		typeof amount === "number" ? amount : Number.parseFloat(String(amount));
	if (!Number.isFinite(numeric)) return 0;
	if (numeric < 0) return numeric;
	return transactionType === "Receita" ? Math.abs(numeric) : -Math.abs(numeric);
}

export function shouldIncludeInCardInvoiceTotal(
	kind: InvoiceReconciliationRowKind,
): boolean {
	return kind === "transaction";
}

export function shouldIncludeExistingInInvoiceTotal(
	row: InvoiceReconciliationExistingRow,
): boolean {
	if (isInvoicePaymentDescription(row.name)) return false;
	if (row.name === INVOICE_ADJUSTMENT_NAME) return false;
	return true;
}

function extraRowMatchKey(name: string, amount: number): string {
	return `${name.trim().replace(/\s+/g, " ").toLowerCase()}|${Math.round(Math.abs(amount) * 100)}`;
}

function collectSelectedExtraExistingIds(
	reviewRows: InvoiceReconciliationReviewRow[],
	existingRows: InvoiceReconciliationExistingRow[],
): Set<string> {
	const ids = new Set<string>();
	const selectedExtras = reviewRows.filter(
		(row) => row.kind === "invoice_extra" && row.selected,
	);
	const claimedExistingIds = new Set<string>();

	for (const extra of selectedExtras) {
		if (
			extra.existingTransactionId &&
			existingRows.some((row) => row.id === extra.existingTransactionId)
		) {
			ids.add(extra.existingTransactionId);
			claimedExistingIds.add(extra.existingTransactionId);
		}
	}

	for (const extra of selectedExtras) {
		if (
			extra.existingTransactionId &&
			claimedExistingIds.has(extra.existingTransactionId)
		) {
			continue;
		}

		const extraKey = extraRowMatchKey(extra.description, extra.amount);
		const extraSigned = signedAmountFromReviewValues(
			extra.amount,
			extra.transactionType,
		);

		const match = existingRows.find((row) => {
			if (claimedExistingIds.has(row.id) || ids.has(row.id)) return false;
			const existingSigned = signedAmountFromStoredValue(
				row.amount,
				row.transactionType,
			);
			if (Math.round(existingSigned * 100) !== Math.round(extraSigned * 100)) {
				return false;
			}
			return extraRowMatchKey(row.name, Number(row.amount)) === extraKey;
		});

		if (match) {
			ids.add(match.id);
			claimedExistingIds.add(match.id);
		}
	}

	return ids;
}

function filterExistingInvoiceRows(
	rows: InvoiceReconciliationExistingRow[],
): InvoiceReconciliationExistingRow[] {
	return rows.filter(shouldIncludeExistingInInvoiceTotal);
}

function filterReviewInvoiceRows(
	rows: InvoiceReconciliationReviewRow[],
): InvoiceReconciliationReviewRow[] {
	return rows.filter(
		(row) =>
			shouldIncludeInCardInvoiceTotal(row.kind) &&
			!isInvoicePaymentDescription(row.description),
	);
}

export function sumSignedAmountsForImportedTransactions(
	transactions: ImportedTransaction[],
): number {
	return transactions.reduce((total, transaction) => {
		if (isInvoicePaymentDescription(transaction.description)) {
			return total;
		}

		return (
			total +
			signedAmountFromReviewValues(
				transaction.amount,
				transaction.transactionType,
			)
		);
	}, 0);
}

export function sumSignedAmountsForReviewRows(
	rows: InvoiceReconciliationReviewRow[],
	options?: {
		selectedOnly?: boolean;
		importableOnly?: boolean;
	},
): number {
	return rows.reduce((total, row) => {
		if (options?.selectedOnly && !row.selected) return total;
		if (!shouldIncludeInCardInvoiceTotal(row.kind)) return total;
		if (options?.importableOnly) {
			if (!row.selected) return total;
			if (row.linked) return total;
			if (row.isDuplicate && !row.reimported) return total;
		}

		return (
			total + signedAmountFromReviewValues(row.amount, row.transactionType)
		);
	}, 0);
}

export function sumSignedAmountsForExistingRows(
	rows: InvoiceReconciliationExistingRow[],
): number {
	return filterExistingInvoiceRows(rows).reduce(
		(total, row) =>
			total + signedAmountFromStoredValue(row.amount, row.transactionType),
		0,
	);
}

export function displayInvoiceTotal(signedTotal: number): number {
	return Math.round(Math.abs(signedTotal) * 100) / 100;
}

export function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

export type ImportInvoiceReconciliation = {
	sourceTotal: number;
	existingSignedTotal: number;
	existingDisplayTotal: number;
	selectedImportSignedTotal: number;
	selectedImportDisplayTotal: number;
	projectedSignedTotal: number;
	projectedDisplayTotal: number;
	delta: number;
	extraExistingRows: InvoiceReconciliationExistingRow[];
	unselectedFileRows: InvoiceReconciliationReviewRow[];
	missingFileRows: InvoiceReconciliationMissingFileRow[];
	pendingImportRows: InvoiceReconciliationReviewRow[];
	amountMismatchRows: InvoiceReconciliationAmountMismatch[];
	excessSignedTotal: number;
	missingSignedTotal: number;
	mismatchSignedTotal: number;
	pendingImportSignedTotal: number;
};

export function computeImportReconciliation(input: {
	sourceTotal: number;
	reviewRows: InvoiceReconciliationReviewRow[];
	existingRows: InvoiceReconciliationExistingRow[];
	fileExternalIds: string[];
}): ImportInvoiceReconciliation {
	const fileExternalIdSet = new Set(
		input.fileExternalIds.filter((id): id is string => Boolean(id)),
	);

	const invoiceExistingRows = filterExistingInvoiceRows(input.existingRows);
	const invoiceReviewRows = filterReviewInvoiceRows(input.reviewRows);

	const existingSignedTotal = sumSignedAmountsForExistingRows(
		input.existingRows,
	);
	const selectedImportSignedTotal = sumSignedAmountsForReviewRows(
		input.reviewRows,
		{ importableOnly: true },
	);
	const extraIdsToRemove = collectSelectedExtraExistingIds(
		input.reviewRows,
		invoiceExistingRows,
	);
	const remainingExistingRows = invoiceExistingRows.filter(
		(row) => !extraIdsToRemove.has(row.id),
	);
	const remainingExistingSignedTotal = remainingExistingRows.reduce(
		(total, row) =>
			total + signedAmountFromStoredValue(row.amount, row.transactionType),
		0,
	);
	const projectedSignedTotal =
		remainingExistingSignedTotal + selectedImportSignedTotal;

	const fileRowByExternalId = new Map(
		invoiceReviewRows
			.filter(
				(row): row is InvoiceReconciliationReviewRow & { externalId: string } =>
					Boolean(row.externalId),
			)
			.map((row) => [row.externalId, row]),
	);

	const amountMismatchRows: InvoiceReconciliationAmountMismatch[] = [];

	for (const existing of invoiceExistingRows) {
		if (!existing.ofxFitId || !fileExternalIdSet.has(existing.ofxFitId)) {
			continue;
		}

		const fileRow = fileRowByExternalId.get(existing.ofxFitId);
		if (!fileRow) continue;

		const existingSigned = signedAmountFromStoredValue(
			existing.amount,
			existing.transactionType,
		);
		const fileSigned = signedAmountFromReviewValues(
			fileRow.amount,
			fileRow.transactionType,
		);
		const signedDelta = roundMoney(existingSigned - fileSigned);

		if (Math.abs(signedDelta) > 0.01) {
			amountMismatchRows.push({
				existingId: existing.id,
				externalId: existing.ofxFitId,
				name: existing.name,
				existingSignedAmount: existingSigned,
				fileSignedAmount: fileSigned,
				signedDelta,
			});
		}
	}

	const mismatchedExistingIds = new Set(
		amountMismatchRows.map((row) => row.existingId),
	);

	const extraExistingRows = findRegisteredRowsMissingFromFile(
		invoiceExistingRows.filter((row) => !mismatchedExistingIds.has(row.id)),
		invoiceReviewRows.map((row) => ({
			externalId: row.externalId,
			date: row.date,
			amount: row.amount,
			transactionType: row.transactionType,
			description: row.description,
		})),
	);

	const missingFileRows: InvoiceReconciliationMissingFileRow[] =
		invoiceReviewRows
			.filter((row) => !row.isDuplicate && !row.linked && !row.selected)
			.map((row) => ({
				...row,
				reason: "not_selected" as const,
			}));

	const pendingImportRows: InvoiceReconciliationReviewRow[] =
		invoiceReviewRows.filter(
			(row) => !row.isDuplicate && !row.linked && row.selected,
		);

	const unselectedFileRows = missingFileRows;

	const excessSignedTotal = extraExistingRows.reduce(
		(total, row) =>
			total + signedAmountFromStoredValue(row.amount, row.transactionType),
		0,
	);
	const missingSignedTotal = missingFileRows.reduce(
		(total, row) =>
			total + signedAmountFromReviewValues(row.amount, row.transactionType),
		0,
	);
	const mismatchSignedTotal = amountMismatchRows.reduce(
		(total, row) => total + row.signedDelta,
		0,
	);
	const pendingImportSignedTotal = pendingImportRows.reduce(
		(total, row) =>
			total + signedAmountFromReviewValues(row.amount, row.transactionType),
		0,
	);

	const projectedDisplayTotal = displayInvoiceTotal(projectedSignedTotal);

	return {
		sourceTotal: roundMoney(input.sourceTotal),
		existingSignedTotal,
		existingDisplayTotal: displayInvoiceTotal(existingSignedTotal),
		selectedImportSignedTotal,
		selectedImportDisplayTotal: displayInvoiceTotal(selectedImportSignedTotal),
		projectedSignedTotal,
		projectedDisplayTotal,
		delta: roundMoney(projectedDisplayTotal - input.sourceTotal),
		extraExistingRows,
		unselectedFileRows,
		missingFileRows,
		pendingImportRows,
		amountMismatchRows,
		excessSignedTotal: roundMoney(excessSignedTotal),
		missingSignedTotal: roundMoney(missingSignedTotal),
		mismatchSignedTotal: roundMoney(mismatchSignedTotal),
		pendingImportSignedTotal: roundMoney(pendingImportSignedTotal),
	};
}

export function isInvoiceTotalReconciled(
	delta: number,
	tolerance = 0.01,
): boolean {
	return Math.abs(delta) <= tolerance;
}
