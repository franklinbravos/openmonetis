import {
	type ImportDuplicateValidation,
	isImportLinkSuggestion,
	isImportRowLinked,
	isImportRowResolved,
	isVerifiedImportDuplicate,
} from "@/features/transactions/lib/import-duplicate-match";
import {
	isValidInstallmentImport,
	isValidRecurrenceImport,
	type ReviewInstallmentImport,
	type ReviewRecurrenceImport,
} from "@/features/transactions/lib/import-installments";
import { isInvoiceExtraReviewRow } from "@/features/transactions/lib/import-invoice-extra-rows";
import { normalizeImportedText } from "@/shared/lib/import/helpers";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";

export type ImportReviewStatusFilter =
	| "all"
	| "pending"
	| "uncategorized"
	| "without_payer"
	| "ready"
	| "selected"
	| "excluded"
	| "duplicate_verified"
	| "duplicate_mismatch"
	| "link_suggestion"
	| "linked"
	| "ai_suggested"
	| "invoice_extra";

export interface ImportReviewFilterableRow {
	selected: boolean;
	description: string;
	sourceDescription: string;
	date: string;
	amount: number;
	transactionType: "expense" | "income";
	kind: "transaction" | "invoice_payment" | "transfer" | "invoice_extra";
	categoryId: string | null;
	payerId: string | null;
	isDuplicate: boolean;
	duplicateValidation: ImportDuplicateValidation | null;
	invoicePaymentCardId: string | null;
	invoicePaymentPeriod: string | null;
	transferPeerAccountId: string | null;
	installmentImport: ReviewInstallmentImport | null;
	recurrenceImport: ReviewRecurrenceImport | null;
	linked?: boolean;
	aiSuggestion?: {
		duplicate?: boolean;
		category?: boolean;
		note?: string;
		confidence?: number;
	} | null;
}

export const IMPORT_REVIEW_STATUS_FILTER_OPTIONS: Array<{
	value: ImportReviewStatusFilter;
	label: string;
}> = [
	{ value: "all", label: "Todos" },
	{ value: "pending", label: "Pendências" },
	{ value: "uncategorized", label: "Sem categoria" },
	{ value: "without_payer", label: "Sem pessoa" },
	{ value: "ready", label: "Prontos" },
	{ value: "selected", label: "Selecionados" },
	{ value: "excluded", label: "Excluídos" },
	{ value: "duplicate_verified", label: "Conferidos" },
	{ value: "duplicate_mismatch", label: "Divergências" },
	{ value: "link_suggestion", label: "Vínculo sugerido" },
	{ value: "linked", label: "Vinculados" },
	{ value: "ai_suggested", label: "Sugestão da IA" },
	{ value: "invoice_extra", label: "A mais no cadastro" },
];

export function isImportReviewRowImportable(
	row: ImportReviewFilterableRow,
): row is ImportReviewFilterableRow & {
	kind: "transaction" | "invoice_payment" | "transfer";
} {
	return (
		!isInvoiceExtraReviewRow(row) &&
		!isImportRowResolved(row) &&
		!isImportLinkSuggestion(row)
	);
}

export function isImportReviewRowClassified(
	row: ImportReviewFilterableRow,
): boolean {
	if (isVerifiedImportDuplicate(row) || isImportRowLinked(row)) {
		return false;
	}

	if (row.kind === "invoice_payment") {
		return Boolean(row.invoicePaymentCardId && row.invoicePaymentPeriod);
	}

	if (row.kind === "transfer") {
		return Boolean(row.transferPeerAccountId);
	}

	return Boolean(row.categoryId);
}

export function isImportReviewRowNeedsAttention(
	row: ImportReviewFilterableRow,
): boolean {
	if (isImportLinkSuggestion(row)) {
		return true;
	}

	if (row.duplicateValidation?.status === "mismatch" && row.selected) {
		return true;
	}

	if (!row.selected || isImportRowResolved(row)) {
		return false;
	}

	if (!isImportReviewRowClassified(row)) {
		return true;
	}

	if (
		row.installmentImport?.enabled &&
		!isValidInstallmentImport(row.installmentImport)
	) {
		return true;
	}

	if (
		row.recurrenceImport?.enabled &&
		!isValidRecurrenceImport(row.recurrenceImport)
	) {
		return true;
	}

	return false;
}

function normalizeSearchValue(value: string): string {
	return normalizeImportedText(value).toLowerCase();
}

export function matchesImportReviewSearch(
	row: ImportReviewFilterableRow,
	query: string,
): boolean {
	const normalizedQuery = normalizeSearchValue(query);
	if (!normalizedQuery) {
		return true;
	}

	const searchableValues = [
		row.description,
		row.sourceDescription,
		formatDate(row.date),
		formatCurrency(row.amount),
		row.amount.toFixed(2),
		row.amount.toFixed(2).replace(".", ","),
	];

	const normalizedHaystack = searchableValues
		.map((value) => normalizeSearchValue(value))
		.join(" ");

	if (normalizedHaystack.includes(normalizedQuery)) {
		return true;
	}

	const numericQuery = normalizedQuery.replace(/[^\d,.-]/g, "");
	if (numericQuery.length >= 2) {
		const amountVariants = [
			row.amount.toFixed(2),
			row.amount.toFixed(2).replace(".", ","),
			formatCurrency(row.amount).replace(/\s/g, "").toLowerCase(),
		];

		return amountVariants.some((amount) =>
			amount.toLowerCase().includes(numericQuery.replace(".", ",")),
		);
	}

	return false;
}

export function matchesImportReviewStatusFilter(
	row: ImportReviewFilterableRow,
	filter: ImportReviewStatusFilter,
): boolean {
	switch (filter) {
		case "all":
			return true;
		case "pending":
			return isImportReviewRowNeedsAttention(row);
		case "uncategorized":
			return (
				row.selected &&
				row.kind === "transaction" &&
				!row.categoryId &&
				isImportReviewRowImportable(row)
			);
		case "without_payer":
			return row.selected && !row.payerId && isImportReviewRowImportable(row);
		case "ready":
			return (
				row.selected &&
				isImportReviewRowImportable(row) &&
				isImportReviewRowClassified(row)
			);
		case "selected":
			return row.selected && isImportReviewRowImportable(row);
		case "excluded":
			return !row.selected && isImportReviewRowImportable(row);
		case "duplicate_verified":
			return isVerifiedImportDuplicate(row);
		case "duplicate_mismatch":
			return row.duplicateValidation?.status === "mismatch";
		case "link_suggestion":
			return isImportLinkSuggestion(row);
		case "linked":
			return isImportRowLinked(row);
		case "ai_suggested":
			return Boolean(row.aiSuggestion);
		case "invoice_extra":
			return isInvoiceExtraReviewRow(row);
		default:
			return true;
	}
}

export function filterImportReviewRows<T extends ImportReviewFilterableRow>(
	rows: T[],
	searchQuery: string,
	statusFilter: ImportReviewStatusFilter,
): T[] {
	return rows.filter(
		(row) =>
			matchesImportReviewSearch(row, searchQuery) &&
			matchesImportReviewStatusFilter(row, statusFilter),
	);
}

export function countImportReviewRowsByStatus<
	T extends ImportReviewFilterableRow,
>(rows: T[]): Record<ImportReviewStatusFilter, number> {
	return {
		all: rows.length,
		pending: rows.filter(isImportReviewRowNeedsAttention).length,
		uncategorized: rows.filter(
			(row) =>
				row.selected &&
				row.kind === "transaction" &&
				!row.categoryId &&
				isImportReviewRowImportable(row),
		).length,
		without_payer: rows.filter(
			(row) => row.selected && !row.payerId && isImportReviewRowImportable(row),
		).length,
		ready: rows.filter(
			(row) =>
				row.selected &&
				isImportReviewRowImportable(row) &&
				isImportReviewRowClassified(row),
		).length,
		selected: rows.filter(
			(row) => row.selected && isImportReviewRowImportable(row),
		).length,
		excluded: rows.filter(
			(row) => !row.selected && isImportReviewRowImportable(row),
		).length,
		duplicate_verified: rows.filter(isVerifiedImportDuplicate).length,
		duplicate_mismatch: rows.filter(
			(row) => row.duplicateValidation?.status === "mismatch",
		).length,
		link_suggestion: rows.filter(isImportLinkSuggestion).length,
		linked: rows.filter(isImportRowLinked).length,
		ai_suggested: rows.filter((row) => Boolean(row.aiSuggestion)).length,
		invoice_extra: rows.filter(isInvoiceExtraReviewRow).length,
	};
}

export function buildImportReviewFilteredEntries<
	T extends ImportReviewFilterableRow,
>(
	rows: T[],
	searchQuery: string,
	statusFilter: ImportReviewStatusFilter,
): Array<{ row: T; index: number }> {
	return rows
		.map((row, index) => ({ row, index }))
		.filter(
			({ row }) =>
				matchesImportReviewSearch(row, searchQuery) &&
				matchesImportReviewStatusFilter(row, statusFilter),
		);
}

export function hasActiveImportReviewFilters(
	searchQuery: string,
	statusFilter: ImportReviewStatusFilter,
): boolean {
	return searchQuery.trim().length > 0 || statusFilter !== "all";
}
