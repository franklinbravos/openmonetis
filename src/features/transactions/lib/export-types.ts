import type { TransactionsViewMode } from "@/features/transactions/lib/view-mode";

type TransactionExportFilters = {
	transactionFilter: string | null;
	conditionFilters: string[];
	paymentFilters: string[];
	payerFilters: string[];
	categoryFilters: string[];
	accountCardFilters: string[];
	searchFilter: string | null;
	settledFilter: string | null;
	attachmentFilter: string | null;
	dividedFilter: string | null;
	amountMinFilter: number | null;
	amountMaxFilter: number | null;
	dateStartFilter: string | null;
	dateEndFilter: string | null;
};

export type TransactionsExportContext = {
	source: "transactions" | "account-statement";
	period: string;
	filters: TransactionExportFilters;
	accountId?: string | null;
	cardId?: string | null;
	payerId?: string | null;
	settledOnly?: boolean;
	viewMode?: TransactionsViewMode;
};

export type TransactionsPaginationState = {
	page: number;
	pageSize: number;
	totalItems: number;
	totalPages: number;
};
