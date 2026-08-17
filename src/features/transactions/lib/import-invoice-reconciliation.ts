import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import type { ImportDuplicateSnapshot } from "@/features/transactions/lib/import-duplicate-match";
import { invoiceSourceTotalFromStatement } from "@/shared/lib/import/invoice-source-total";
import { sourceFileRowsFromStatement } from "@/shared/lib/import/invoice-file-match";
import type {
	InvoiceReconciliationExistingRow,
	InvoiceReconciliationReviewRow,
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
	if (
		input.initialCardId &&
		!input.accountCardValue?.startsWith("account:")
	) {
		return true;
	}
	return false;
}
