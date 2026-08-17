import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import type { ImportDuplicateSnapshot } from "@/features/transactions/lib/import-duplicate-match";
import { collectImportLinkedExistingTransactionIds } from "@/features/transactions/lib/import-duplicate-match";
import { mapDuplicateSnapshotToExistingRow } from "@/features/transactions/lib/import-invoice-reconciliation";
import { detectInstallmentFromName } from "@/features/transactions/lib/installment-detection";
import { normalizeImportedText } from "@/shared/lib/import/helpers";
import {
	shouldIncludeExistingInInvoiceTotal,
	signedAmountFromStoredValue,
} from "@/shared/lib/import/invoice-total";

export type InvoiceExtraReason = "duplicate" | "not_in_file";

export function buildInvoiceExtraReviewRowKey(transactionId: string): string {
	return `existing:${transactionId}`;
}

export function isInvoiceExtraReviewRow(row: {
	kind?: ReviewRow["kind"];
}): row is ReviewRow & { kind: "invoice_extra" } {
	return row.kind === "invoice_extra";
}

export function collectMatchedExistingTransactionIdsFromReviewRows(
	rows: ReviewRow[],
): Set<string> {
	const ids = collectImportLinkedExistingTransactionIds(rows);

	for (const row of rows) {
		if (isInvoiceExtraReviewRow(row)) continue;

		if (row.linked && row.linkedTransactionId) {
			ids.add(row.linkedTransactionId);
		}

		if (row.isDuplicate && row.duplicateValidation?.existingTransactionId) {
			ids.add(row.duplicateValidation.existingTransactionId);
		}
	}

	return ids;
}

function snapshotPurchaseDate(snapshot: ImportDuplicateSnapshot): string {
	const value = snapshot.purchaseDate;
	if (value instanceof Date) {
		return value.toISOString().slice(0, 10);
	}
	return String(value).slice(0, 10);
}

function snapshotTransactionType(
	snapshot: ImportDuplicateSnapshot,
): "income" | "expense" {
	return snapshot.transactionType === "Receita" ? "income" : "expense";
}

function snapshotAmount(snapshot: ImportDuplicateSnapshot): number {
	const numeric = Number.parseFloat(snapshot.amount);
	return Number.isFinite(numeric) ? Math.abs(numeric) : 0;
}

function shouldSkipExistingSnapshotAsExtra(input: {
	snapshot: ImportDuplicateSnapshot;
	matchedExistingIds: Set<string>;
	fileExternalIdSet: Set<string>;
	fileRows: ReviewRow[];
}): boolean {
	if (input.matchedExistingIds.has(input.snapshot.id)) {
		return true;
	}

	if (
		input.snapshot.ofxFitId &&
		input.fileExternalIdSet.has(input.snapshot.ofxFitId)
	) {
		return true;
	}

	return false;
}

function extraMatchKey(name: string, amount: number): string {
	const detected = detectInstallmentFromName(name);
	const baseName = normalizeImportedText(detected?.name ?? name).toLowerCase();
	return `${baseName}|${Math.round(Math.abs(amount) * 100)}`;
}

function snapshotMatchesFileRowAsDuplicate(
	snapshot: ImportDuplicateSnapshot,
	fileRows: ReviewRow[],
): boolean {
	const snapshotKey = extraMatchKey(snapshot.name, snapshotAmount(snapshot));

	return fileRows.some((row) => {
		const fileName = row.installmentImport?.enabled
			? row.installmentImport.name
			: row.sourceDescription || row.description;
		const fileKey = extraMatchKey(fileName, row.amount);
		if (fileKey !== snapshotKey) return false;

		if (row.transactionType !== snapshotTransactionType(snapshot)) {
			return false;
		}

		return true;
	});
}

export function resolveInvoiceExtraReason(
	snapshot: ImportDuplicateSnapshot,
	fileRows: ReviewRow[],
): InvoiceExtraReason {
	return snapshotMatchesFileRowAsDuplicate(snapshot, fileRows)
		? "duplicate"
		: "not_in_file";
}

export function buildInvoiceExtraReviewRow(
	snapshot: ImportDuplicateSnapshot,
	options?: { selected?: boolean; reason?: InvoiceExtraReason },
): ReviewRow {
	const existingRow = mapDuplicateSnapshotToExistingRow(snapshot);
	const autoRemove = shouldIncludeExistingInInvoiceTotal(existingRow);

	return {
		reviewKey: crypto.randomUUID(),
		externalId: snapshot.ofxFitId,
		date: snapshotPurchaseDate(snapshot),
		amount: snapshotAmount(snapshot),
		description: snapshot.name,
		sourceDescription: snapshot.name,
		transactionType: snapshotTransactionType(snapshot),
		selected: options?.selected ?? autoRemove,
		isDuplicate: false,
		duplicateValidation: null,
		categoryId: snapshot.categoryId,
		payerId: snapshot.payerId,
		kind: "invoice_extra",
		existingTransactionId: snapshot.id,
		invoiceExtraReason: options?.reason ?? "not_in_file",
		invoicePaymentCardId: null,
		invoicePaymentPeriod: null,
		transferPeerAccountId: null,
		installmentImport: null,
		recurrenceImport: null,
	};
}

export function buildInvoiceExtraReviewRows(input: {
	snapshots: ImportDuplicateSnapshot[];
	fileRows: ReviewRow[];
	fileExternalIds: string[];
	previousRows?: ReviewRow[];
}): ReviewRow[] {
	const fileRows = input.fileRows.filter((row) => !isInvoiceExtraReviewRow(row));
	const matchedExistingIds =
		collectMatchedExistingTransactionIdsFromReviewRows(fileRows);
	const fileExternalIdSet = new Set(
		input.fileExternalIds.filter((id): id is string => Boolean(id)),
	);
	const previousExtraById = new Map(
		(input.previousRows ?? [])
			.filter(
				(row): row is ReviewRow & { existingTransactionId: string } =>
					isInvoiceExtraReviewRow(row) && Boolean(row.existingTransactionId),
			)
			.map((row) => [row.existingTransactionId, row]),
	);

	const extras: ReviewRow[] = [];

	for (const snapshot of input.snapshots) {
		if (
			shouldSkipExistingSnapshotAsExtra({
				snapshot,
				matchedExistingIds,
				fileExternalIdSet,
				fileRows,
			})
		) {
			continue;
		}

		const previous = previousExtraById.get(snapshot.id);
		const reason = resolveInvoiceExtraReason(snapshot, fileRows);
		extras.push(
			buildInvoiceExtraReviewRow(snapshot, {
				selected: previous?.selected,
				reason,
			}),
		);
	}

	return extras;
}

export function mergeInvoiceReviewRowsWithExtras(input: {
	fileRows: ReviewRow[];
	snapshots: ImportDuplicateSnapshot[];
	fileExternalIds: string[];
	previousRows?: ReviewRow[];
}): ReviewRow[] {
	const fileRows = input.fileRows.filter((row) => !isInvoiceExtraReviewRow(row));
	const extras = buildInvoiceExtraReviewRows({
		snapshots: input.snapshots,
		fileRows,
		fileExternalIds: input.fileExternalIds,
		previousRows: input.previousRows,
	});

	return [...fileRows, ...extras];
}

export function collectInvoiceExtraRemovalTransactionIds(
	rows: ReviewRow[],
): string[] {
	return rows
		.filter(
			(row): row is ReviewRow & { existingTransactionId: string } =>
				isInvoiceExtraReviewRow(row) &&
				row.selected &&
				Boolean(row.existingTransactionId),
		)
		.map((row) => row.existingTransactionId);
}

export function sumSignedAmountForInvoiceExtraRemovals(rows: ReviewRow[]): number {
	return rows
		.filter(
			(row): row is ReviewRow & { existingTransactionId: string } =>
				isInvoiceExtraReviewRow(row) && row.selected,
		)
		.reduce((total, row) => {
			return (
				total +
				signedAmountFromStoredValue(
					row.amount,
					row.transactionType === "income" ? "Receita" : "Despesa",
				)
			);
		}, 0);
}
