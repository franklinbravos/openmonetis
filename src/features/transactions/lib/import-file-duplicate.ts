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
};

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
