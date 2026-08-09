import type { ImportBatchStatus } from "@/features/transactions/lib/import-batch-status";

export type ImportFileHistoryEntry = {
	id: string;
	sourceFileName: string;
	sourceFileSize: number | null;
	importedCount: number;
	skippedCount: number;
	status: ImportBatchStatus;
	createdAt: Date;
	hasAttachment: boolean;
	cardId: string | null;
	invoicePeriod: string | null;
	cardName: string | null;
	accountId: string | null;
	accountName: string | null;
};

export type ImportHistoryFilter = {
	cardId: string | null;
	invoicePeriod: string | null;
	accountId: string | null;
};

export function hasImportHistoryFilter(filter: ImportHistoryFilter): boolean {
	return Boolean(filter.cardId || filter.accountId);
}

export function filterImportHistoryEntries(
	entries: ImportFileHistoryEntry[],
	filter: ImportHistoryFilter,
): ImportFileHistoryEntry[] {
	if (filter.cardId) {
		return entries.filter(
			(entry) =>
				entry.cardId === filter.cardId &&
				(!filter.invoicePeriod || entry.invoicePeriod === filter.invoicePeriod),
		);
	}

	if (filter.accountId) {
		return entries.filter(
			(entry) => entry.accountId === filter.accountId && entry.cardId == null,
		);
	}

	return entries;
}

function normalizeImportFileName(value: string): string {
	return value.trim().toLowerCase();
}

export function findDuplicateImportFile(
	file: File,
	history: ImportFileHistoryEntry[],
): ImportFileHistoryEntry | null {
	const normalizedName = normalizeImportFileName(file.name);

	for (const entry of history) {
		if (normalizeImportFileName(entry.sourceFileName) !== normalizedName) {
			continue;
		}

		if (
			entry.sourceFileSize != null &&
			entry.sourceFileSize > 0 &&
			entry.sourceFileSize !== file.size
		) {
			continue;
		}

		return entry;
	}

	return null;
}
