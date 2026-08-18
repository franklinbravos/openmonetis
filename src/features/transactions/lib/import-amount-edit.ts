import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import {
	type ImportDuplicateSnapshot,
	isImportLinkSuggestion,
	isImportRowLinked,
} from "@/features/transactions/lib/import-duplicate-match";
import { isInvoiceExtraReviewRow } from "@/features/transactions/lib/import-invoice-extra-rows";
import type { InvoiceReconciliationExistingRow } from "@/shared/lib/import/invoice-total";

export type ReviewExistingAmountCorrection = {
	transactionId: string;
	amount: number;
};

/** Alias: mesmo contrato de correção usado no rascunho e na action. */
export type ExistingAmountEdit = ReviewExistingAmountCorrection;

export function buildExistingAmountSnapshotMap(
	snapshots: ImportDuplicateSnapshot[],
): Map<string, number> {
	const map = new Map<string, number>();
	for (const snapshot of snapshots) {
		if (typeof snapshot.amount === "string" && snapshot.amount.trim() === "")
			continue;
		const numeric = Math.abs(Number(snapshot.amount));
		if (!Number.isFinite(numeric)) continue;
		map.set(snapshot.id, numeric);
	}
	return map;
}

/**
 * Corrige o valor cadastrado para o valor da fatura. Não reusa
 * `signedAmountFromStoredValue` (invoice-total.ts) de propósito: aquela trata um
 * número negativo como "já assinado" e o devolve como está, enquanto aqui o input
 * é o valor positivo digitado pelo usuário, sempre assinado pelo tipo do lançamento.
 */
export function amountEditToSignedStored(
	amount: number,
	transactionType: string,
): number {
	if (!Number.isFinite(amount)) return 0;
	if (amount === 0) return 0;
	return transactionType === "Receita" ? Math.abs(amount) : -Math.abs(amount);
}

export function enrichReviewRowsWithExistingAmount(
	rows: ReviewRow[],
	existingAmountById: Map<string, number>,
): ReviewRow[] {
	return rows.map((row) => {
		const existingTransactionId =
			row.duplicateValidation?.existingTransactionId ??
			row.existingTransactionId ??
			null;
		if (!existingTransactionId) return row;

		const existingAmount = existingAmountById.get(existingTransactionId);
		if (existingAmount === undefined) {
			if (row.existingAmount === null) return row;
			return { ...row, existingAmount: null };
		}
		if (row.existingAmount === existingAmount) return row;

		return { ...row, existingAmount };
	});
}

export function resolveExistingTransactionIdForAmountEdit(
	row: ReviewRow,
): string | null {
	if (row.kind === "invoice_payment") return null;
	if (row.kind === "transfer") return null;
	if (isInvoiceExtraReviewRow(row) && row.selected) return null;
	if (isImportRowLinked(row)) return null;
	if (isImportLinkSuggestion(row)) return null;
	if (row.reimported) return null;
	if (row.existingAmount == null) return null;
	return (
		row.duplicateValidation?.existingTransactionId ??
		row.existingTransactionId ??
		null
	);
}

export function collectExistingAmountEdits(
	rows: ReviewRow[],
): ExistingAmountEdit[] {
	const edits: ExistingAmountEdit[] = [];
	for (const row of rows) {
		if (!row.existingAmountCorrection) continue;
		const transactionId = resolveExistingTransactionIdForAmountEdit(row);
		if (!transactionId) continue;
		edits.push({
			transactionId,
			amount: row.existingAmountCorrection.amount,
		});
	}
	return edits;
}

export function countExistingAmountEdits(rows: ReviewRow[]): number {
	return collectExistingAmountEdits(rows).length;
}

export function dedupeExistingAmountEdits(
	edits: ExistingAmountEdit[],
): ExistingAmountEdit[] {
	const amountByTransactionId = new Map<string, number>();
	for (const edit of edits) {
		amountByTransactionId.set(edit.transactionId, edit.amount);
	}

	const deduped: ExistingAmountEdit[] = [];
	for (const [transactionId, amount] of amountByTransactionId) {
		deduped.push({ transactionId, amount });
	}
	return deduped;
}

export function applyExistingAmountEdits(
	existingRows: InvoiceReconciliationExistingRow[],
	edits: ExistingAmountEdit[],
): InvoiceReconciliationExistingRow[] {
	const editByTransactionId = new Map(
		edits.map((edit) => [edit.transactionId, edit]),
	);

	return existingRows.map((row) => {
		const edit = editByTransactionId.get(row.id);
		if (!edit) return row;
		return {
			...row,
			amount: amountEditToSignedStored(edit.amount, row.transactionType),
		};
	});
}
