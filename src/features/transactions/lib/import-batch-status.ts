export const IMPORT_BATCH_STATUS = {
	UPLOADED: "uploaded",
	DRAFT: "draft",
	IMPORTED: "imported",
} as const;

export type ImportBatchStatus =
	(typeof IMPORT_BATCH_STATUS)[keyof typeof IMPORT_BATCH_STATUS];

export function isImportBatchImported(status: ImportBatchStatus): boolean {
	return status === IMPORT_BATCH_STATUS.IMPORTED;
}

export function isImportBatchDraft(status: ImportBatchStatus): boolean {
	return status === IMPORT_BATCH_STATUS.DRAFT;
}

export function isImportBatchPending(status: ImportBatchStatus): boolean {
	return (
		status === IMPORT_BATCH_STATUS.UPLOADED ||
		status === IMPORT_BATCH_STATUS.DRAFT
	);
}

export function parseImportBatchStatus(value: string): ImportBatchStatus {
	if (value === IMPORT_BATCH_STATUS.IMPORTED) {
		return IMPORT_BATCH_STATUS.IMPORTED;
	}

	if (value === IMPORT_BATCH_STATUS.DRAFT) {
		return IMPORT_BATCH_STATUS.DRAFT;
	}

	return IMPORT_BATCH_STATUS.UPLOADED;
}
