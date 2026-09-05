import type { ImportLinkMergeMode } from "@/features/transactions/components/import/import-link-dialog";
import type { ImportDuplicateValidation } from "@/features/transactions/lib/import-duplicate-match";

type ImportLinkReviewRow = {
	description: string;
	externalId: string | null;
	categoryId: string | null;
	payerId: string | null;
	transactionType: "income" | "expense";
	kind: "transaction" | "invoice_payment" | "transfer" | "invoice_extra";
	duplicateValidation: ImportDuplicateValidation | null;
	linked?: boolean;
	reimported?: boolean;
};

const AUTO_LINK_BLOCKING_MISMATCH_FIELDS = new Set([
	"amount",
	"date",
	"type",
	"installment",
]);

export function canAutoLinkImportSuggestion(
	validation: ImportDuplicateValidation,
): boolean {
	if (validation.status !== "link_suggestion") return false;
	if (!validation.matchScore.date || !validation.matchScore.amount)
		return false;

	return !validation.mismatches.some((mismatch) =>
		AUTO_LINK_BLOCKING_MISMATCH_FIELDS.has(mismatch.field),
	);
}

export function resolveAutoLinkMergeDescription(
	_validation: ImportDuplicateValidation,
): ImportLinkMergeMode {
	return "import";
}

export function buildImportLinkRequest(input: {
	row: ImportLinkReviewRow;
	validation: ImportDuplicateValidation;
	mergeDescription: ImportLinkMergeMode;
	fallbackPayerId: string | null;
}) {
	return {
		existingTransactionId: input.validation.existingTransactionId,
		importedDescription: input.row.description,
		externalId: input.row.externalId,
		mergeDescription: input.mergeDescription,
		fallbackPayerId: input.fallbackPayerId,
	};
}

export function resolveLinkedReviewRowState<
	TRow extends ImportLinkReviewRow,
>(input: {
	row: TRow;
	validation: ImportDuplicateValidation;
	resolvedPayerId: string | null;
	isCategoryCompatible: (
		categoryId: string | null,
		transactionType: ImportLinkReviewRow["transactionType"],
	) => boolean;
}): TRow {
	const { row, validation, resolvedPayerId, isCategoryCompatible } = input;

	const resolvedCategoryId = validation.existingIsTransfer
		? null
		: validation.existingCategoryId &&
				isCategoryCompatible(validation.existingCategoryId, row.transactionType)
			? validation.existingCategoryId
			: row.categoryId &&
					isCategoryCompatible(row.categoryId, row.transactionType)
				? row.categoryId
				: null;

	return {
		...row,
		linked: true,
		linkedTransactionId: validation.existingTransactionId,
		selected: false,
		payerId: resolvedPayerId,
		categoryId: resolvedCategoryId,
		duplicateValidation: null,
		kind: validation.existingIsTransfer ? ("transfer" as const) : row.kind,
	} as TRow;
}

export function collectImportLinkSuggestionIndexes(
	rows: ImportLinkReviewRow[],
	options?: {
		autoLinkOnly?: boolean;
	},
): number[] {
	return rows.flatMap((row, index) => {
		if (!row.duplicateValidation) return [];
		if (row.duplicateValidation.status !== "link_suggestion") return [];
		if (row.linked || row.reimported) return [];
		if (
			options?.autoLinkOnly &&
			!canAutoLinkImportSuggestion(row.duplicateValidation)
		) {
			return [];
		}
		return [index];
	});
}
