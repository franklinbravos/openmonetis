import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import {
	type ImportDuplicateSnapshot,
	isImportRowLinked,
	isVerifiedImportDuplicate,
} from "@/features/transactions/lib/import-duplicate-match";
import { sourceFileRowsFromStatement } from "@/shared/lib/import/invoice-file-match";
import { invoiceSourceTotalFromStatement } from "@/shared/lib/import/invoice-source-total";
import {
	type InvoiceReconciliationExistingRow,
	type InvoiceReconciliationReviewRow,
	signedAmountFromReviewValues,
} from "@/shared/lib/import/invoice-total";
import type { ImportStatement } from "@/shared/lib/import/types";

export function mapReviewRowToReconciliationRow(
	row: ReviewRow,
): InvoiceReconciliationReviewRow {
	return {
		externalId: row.externalId,
		amount: row.amount,
		transactionType: row.transactionType,
		kind: row.kind,
		selected: row.selected,
		isDuplicate: row.isDuplicate,
		reimported: row.reimported,
		linked: row.linked,
		description: row.description,
		date: row.date,
		existingTransactionId: row.existingTransactionId ?? null,
	};
}

export function mapDuplicateSnapshotToExistingRow(
	snapshot: ImportDuplicateSnapshot,
): InvoiceReconciliationExistingRow {
	return {
		id: snapshot.id,
		ofxFitId: snapshot.ofxFitId,
		name: snapshot.name,
		amount: snapshot.amount,
		transactionType: snapshot.transactionType,
		purchaseDate: snapshot.purchaseDate,
	};
}

export function collectFileExternalIds(
	rows: ReviewRow[],
	statementExternalIds: string[],
): string[] {
	const ids = new Set<string>();
	for (const id of statementExternalIds) {
		if (id) ids.add(id);
	}
	for (const row of rows) {
		if (row.externalId) ids.add(row.externalId);
	}
	return [...ids];
}

export function getRegisterSourceTotalPayload(statement: ImportStatement) {
	const source = invoiceSourceTotalFromStatement(statement);
	return {
		...(source
			? {
					sourceInvoiceTotal: source.amount,
					sourceInvoiceTotalKind: source.kind,
				}
			: {}),
		sourceFileRows: sourceFileRowsFromStatement(statement),
	};
}

export function pickInvoicePeriodExistingSnapshots(
	periods: string[],
	groups: ImportDuplicateSnapshot[][],
	targetPeriod: string | null,
): ImportDuplicateSnapshot[] {
	if (!targetPeriod) return [];
	const index = periods.indexOf(targetPeriod);
	if (index < 0 || !groups[index]) return [];
	return groups[index];
}

/**
 * Lançamentos existentes que pertencem ao período reconciliado. Identificam as
 * linhas do arquivo que entram na somatória do período — um match cross-período
 * (parcela cadastrada sob outro período ou FITID duplicado) aponta para um id fora
 * deste conjunto e não pode ser conferido nem editado nesta revisão (W1).
 */
export function buildInvoicePeriodExistingIdSet(
	snapshots: ImportDuplicateSnapshot[],
): Set<string> {
	const ids = new Set<string>();
	for (const snapshot of snapshots) {
		ids.add(snapshot.id);
	}
	return ids;
}

function resolveReviewExistingTransactionId(row: ReviewRow): string | null {
	return (
		row.linkedTransactionId ??
		row.duplicateValidation?.existingTransactionId ??
		row.existingTransactionId ??
		null
	);
}

/**
 * Linha do arquivo marcada como conferida/vinculada cujo lançamento existente está
 * FORA do período reconciliado. Ela aparece como resolvida na tabela, mas não conta
 * no total da fatura — causa deltas que parecem "sem conteúdo a importar".
 */
export function isImportRowCrossPeriod(
	row: ReviewRow,
	invoicePeriodExistingIdSet: Set<string>,
): boolean {
	if (!isVerifiedImportDuplicate(row) && !isImportRowLinked(row)) {
		return false;
	}

	const existingTransactionId = resolveReviewExistingTransactionId(row);
	if (!existingTransactionId) return false;

	return !invoicePeriodExistingIdSet.has(existingTransactionId);
}

export function collectCrossPeriodReviewRows(
	rows: ReviewRow[],
	invoicePeriodExistingIdSet: Set<string>,
): ReviewRow[] {
	return rows.filter((row) =>
		isImportRowCrossPeriod(row, invoicePeriodExistingIdSet),
	);
}

export function sumSignedAmountForCrossPeriodRows(rows: ReviewRow[]): number {
	return rows.reduce((total, row) => {
		return (
			total + signedAmountFromReviewValues(row.amount, row.transactionType)
		);
	}, 0);
}

export type CrossPeriodReviewStats = {
	count: number;
	displayTotal: number;
};

export function collectCrossPeriodReviewStats(
	rows: ReviewRow[],
	invoicePeriodExistingIdSet: Set<string>,
): CrossPeriodReviewStats {
	const crossPeriodRows = collectCrossPeriodReviewRows(
		rows,
		invoicePeriodExistingIdSet,
	);
	return {
		count: crossPeriodRows.length,
		displayTotal:
			Math.round(
				Math.abs(sumSignedAmountForCrossPeriodRows(crossPeriodRows)) * 100,
			) / 100,
	};
}

export function shouldFetchInvoiceDuplicateSnapshots(input: {
	statementIsCreditCard: boolean;
	resolvedCardId: string | null;
	accountCardValue: string | null;
	activeInvoiceContextCardId: string | null;
	initialCardId: string | null;
}): boolean {
	if (!input.resolvedCardId) return false;
	if (input.statementIsCreditCard) return true;
	if (input.accountCardValue?.startsWith("card:")) return true;
	if (input.activeInvoiceContextCardId) return true;
	if (input.initialCardId && !input.accountCardValue?.startsWith("account:")) {
		return true;
	}
	return false;
}
