import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNull,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import {
	cards,
	categories,
	financialAccounts,
	payers,
	transactionAttachments,
	transactions,
} from "@/db/schema";
import {
	buildPeriodTotals,
	type PeriodSummaryRow,
} from "@/features/dashboard/overview/period-overview-queries";
import type {
	PeriodCarouselMonth,
	PeriodCarouselStatus,
} from "@/shared/components/month-picker/period-carousel-types";
import { INITIAL_BALANCE_NOTE } from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { enrichTransactionsWithTransferPeers } from "@/shared/lib/transfers/enrich-transfer-peers";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	comparePeriods,
	getCurrentPeriod,
} from "@/shared/utils/period";

type BaseTransactionQueryInput = {
	filters: SQL[];
	extraFilters?: SQL[];
	excludeInitialBalanceFromIncome?: boolean;
};

type TransactionQueryInput = BaseTransactionQueryInput & {
	limit?: number;
	offset?: number;
};

type PaginatedTransactionsResult = {
	rows: Awaited<ReturnType<typeof fetchTransactions>>;
	totalItems: number;
	page: number;
	pageSize: number;
	totalPages: number;
};

const DEFAULT_EXCLUDE_INITIAL_BALANCE = true;

const buildInitialBalanceVisibilityFilter = () =>
	or(
		isNull(transactions.note),
		ne(transactions.note, INITIAL_BALANCE_NOTE),
		isNull(financialAccounts.excludeInitialBalanceFromIncome),
		eq(financialAccounts.excludeInitialBalanceFromIncome, false),
	);

const buildTransactionsWhere = ({
	filters,
	extraFilters = [],
	excludeInitialBalanceFromIncome = DEFAULT_EXCLUDE_INITIAL_BALANCE,
}: BaseTransactionQueryInput) => {
	const whereFilters = [...filters, ...extraFilters];

	if (excludeInitialBalanceFromIncome) {
		const initialBalanceFilter = buildInitialBalanceVisibilityFilter();

		if (initialBalanceFilter) {
			whereFilters.push(initialBalanceFilter);
		}
	}

	return and(...whereFilters);
};

const mapTransactionRows = (
	transactionRows: {
		transaction: typeof transactions.$inferSelect;
		payer: typeof payers.$inferSelect | null;
		financialAccount: typeof financialAccounts.$inferSelect | null;
		card: typeof cards.$inferSelect | null;
		category: typeof categories.$inferSelect | null;
		hasAttachments: boolean;
	}[],
) =>
	transactionRows.map((row) => ({
		...row.transaction,
		payer: row.payer,
		financialAccount: row.financialAccount,
		card: row.card,
		category: row.category,
		hasAttachments: row.hasAttachments,
	}));

type TransactionWithRelations = ReturnType<typeof mapTransactionRows>[number];

/** Fallback quando embeds do bridge não retornam relações, mas os FKs existem. */
async function enrichMissingTransactionRelations(
	rows: TransactionWithRelations[],
): Promise<TransactionWithRelations[]> {
	const missingPayerIds = new Set<string>();
	const missingCategoryIds = new Set<string>();
	const missingAccountIds = new Set<string>();
	const missingCardIds = new Set<string>();

	for (const row of rows) {
		if (row.payerId && !row.payer) {
			missingPayerIds.add(row.payerId);
		}
		if (row.categoryId && !row.category) {
			missingCategoryIds.add(row.categoryId);
		}
		if (row.accountId && !row.financialAccount) {
			missingAccountIds.add(row.accountId);
		}
		if (row.cardId && !row.card) {
			missingCardIds.add(row.cardId);
		}
	}

	if (
		missingPayerIds.size === 0 &&
		missingCategoryIds.size === 0 &&
		missingAccountIds.size === 0 &&
		missingCardIds.size === 0
	) {
		return rows;
	}

	const [payerRows, categoryRows, accountRows, cardRows] = await Promise.all([
		missingPayerIds.size > 0
			? db.query.payers.findMany({
					where: inArray(payers.id, [...missingPayerIds]),
				})
			: Promise.resolve([]),
		missingCategoryIds.size > 0
			? db.query.categories.findMany({
					where: inArray(categories.id, [...missingCategoryIds]),
				})
			: Promise.resolve([]),
		missingAccountIds.size > 0
			? db.query.financialAccounts.findMany({
					where: inArray(financialAccounts.id, [...missingAccountIds]),
				})
			: Promise.resolve([]),
		missingCardIds.size > 0
			? db.query.cards.findMany({
					where: inArray(cards.id, [...missingCardIds]),
				})
			: Promise.resolve([]),
	]);

	const payerById = new Map(payerRows.map((row) => [row.id, row]));
	const categoryById = new Map(categoryRows.map((row) => [row.id, row]));
	const accountById = new Map(accountRows.map((row) => [row.id, row]));
	const cardById = new Map(cardRows.map((row) => [row.id, row]));

	return rows.map((row) => ({
		...row,
		payer:
			row.payer ?? (row.payerId ? (payerById.get(row.payerId) ?? null) : null),
		category:
			row.category ??
			(row.categoryId ? (categoryById.get(row.categoryId) ?? null) : null),
		financialAccount:
			row.financialAccount ??
			(row.accountId ? (accountById.get(row.accountId) ?? null) : null),
		card: row.card ?? (row.cardId ? (cardById.get(row.cardId) ?? null) : null),
	}));
}

async function selectTransactionsWithRelations({
	filters,
	extraFilters = [],
	excludeInitialBalanceFromIncome = DEFAULT_EXCLUDE_INITIAL_BALANCE,
	limit,
	offset,
}: TransactionQueryInput) {
	const baseQuery = db
		.select({
			transaction: transactions,
			payer: payers,
			financialAccount: financialAccounts,
			card: cards,
			category: categories,
			hasAttachments: sql<boolean>`EXISTS (
				SELECT 1 FROM ${transactionAttachments}
				WHERE ${transactionAttachments.transactionId} = ${transactions.id}
			)`,
		})
		.from(transactions)
		.leftJoin(payers, eq(transactions.payerId, payers.id))
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.leftJoin(cards, eq(transactions.cardId, cards.id))
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(
			buildTransactionsWhere({
				filters,
				extraFilters,
				excludeInitialBalanceFromIncome,
			}),
		)
		.orderBy(desc(transactions.purchaseDate), desc(transactions.createdAt));

	const transactionRows =
		typeof limit === "number"
			? await baseQuery.limit(limit).offset(offset ?? 0)
			: await baseQuery;

	const mappedRows = await enrichMissingTransactionRelations(
		mapTransactionRows(transactionRows),
	);

	return enrichTransactionsWithTransferPeers(mappedRows);
}

export async function fetchTransactionFilterSources(userId: string) {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	const [payerRows, accountRows, cardRows, categoryRows] = await Promise.all([
		db.query.payers.findMany({
			where: eq(payers.userId, dataOwnerUserId),
		}),
		db.query.financialAccounts.findMany({
			where: and(
				eq(financialAccounts.userId, dataOwnerUserId),
				eq(financialAccounts.status, "Ativa"),
			),
		}),
		db.query.cards.findMany({
			where: and(eq(cards.userId, dataOwnerUserId), eq(cards.status, "Ativo")),
		}),
		db.query.categories.findMany({
			where: eq(categories.userId, dataOwnerUserId),
		}),
	]);

	return { payerRows, accountRows, cardRows, categoryRows };
}

export async function fetchTransactionsWithRelations(
	input: BaseTransactionQueryInput,
) {
	return selectTransactionsWithRelations(input);
}

export async function fetchTransactions(filters: SQL[]) {
	return fetchTransactionsWithRelations({ filters });
}

export async function fetchTransactionsPage(
	filters: SQL[],
	{
		page,
		pageSize,
	}: {
		page: number;
		pageSize: number;
	},
): Promise<PaginatedTransactionsResult> {
	const [countRow] = await db
		.select({ total: count() })
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.leftJoin(cards, eq(transactions.cardId, cards.id))
		.where(buildTransactionsWhere({ filters }));

	const totalItems = Number(countRow?.total ?? 0);
	const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
	const currentPage = Math.min(page, totalPages);
	const rows = await selectTransactionsWithRelations({
		filters,
		limit: pageSize,
		offset: (currentPage - 1) * pageSize,
	});

	return {
		rows,
		totalItems,
		page: currentPage,
		pageSize,
		totalPages,
	};
}

export async function fetchTransactionsPageWithRelations({
	filters,
	page,
	pageSize,
	extraFilters = [],
	excludeInitialBalanceFromIncome = DEFAULT_EXCLUDE_INITIAL_BALANCE,
}: BaseTransactionQueryInput & {
	page: number;
	pageSize: number;
}): Promise<PaginatedTransactionsResult> {
	const [countRow] = await db
		.select({ total: count() })
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.leftJoin(cards, eq(transactions.cardId, cards.id))
		.where(
			buildTransactionsWhere({
				filters,
				extraFilters,
				excludeInitialBalanceFromIncome,
			}),
		);

	const totalItems = Number(countRow?.total ?? 0);
	const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
	const currentPage = Math.min(page, totalPages);
	const rows = await selectTransactionsWithRelations({
		filters,
		extraFilters,
		excludeInitialBalanceFromIncome,
		limit: pageSize,
		offset: (currentPage - 1) * pageSize,
	});

	return {
		rows,
		totalItems,
		page: currentPage,
		pageSize,
		totalPages,
	};
}

export async function fetchRecentEstablishments(
	userId: string,
): Promise<string[]> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const rows = await callRpc<{ name: string | null }>(
		"get_recent_establishments",
		{ p_user_id: dataOwnerUserId },
	);

	return rows
		.map((row) => row.name)
		.filter((name): name is string => name !== null);
}

type PurchaseDateOverviewRow = {
	periodo: string | null;
	tipo_transacao: string | null;
	total_amount: string | number | null;
	refund_amount: string | number | null;
	conta_excluir_do_saldo: boolean | null;
};

export async function fetchTransactionsMonthSummaries(
	userId: string,
): Promise<PeriodCarouselMonth[]> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	const currentPeriod = getCurrentPeriod();
	const endPeriod = addMonthsToPeriod(currentPeriod, 2);
	const startPeriod = addMonthsToPeriod(currentPeriod, -24);

	const rows = await callRpc<PurchaseDateOverviewRow>(
		"get_purchase_date_overview",
		{
			p_user_id: dataOwnerUserId,
			p_start_period: startPeriod,
			p_end_period: endPeriod,
		},
	);

	const periodTotals = buildPeriodTotals(
		rows.map(
			(row): PeriodSummaryRow => ({
				period: row.periodo,
				transactionType: row.tipo_transacao ?? "",
				totalAmount: row.total_amount,
				refundAmount: row.refund_amount,
				accountExcludeFromBalance: row.conta_excluir_do_saldo,
			}),
		),
	);

	const knownPeriods = Array.from(periodTotals.keys()).sort((left, right) =>
		comparePeriods(left, right),
	);
	const rangeStart = knownPeriods[0] ?? addMonthsToPeriod(currentPeriod, -5);
	const periodRange = buildPeriodRange(rangeStart, endPeriod);

	return periodRange.map((period) => {
		const totals = periodTotals.get(period);
		const incomes = totals?.receitas ?? 0;
		const grossExpenses = totals?.despesas ?? 0;
		const refunds = totals?.reembolsos ?? 0;
		const expenses = Math.max(0, grossExpenses - refunds);
		const balance =
			incomes - grossExpenses + refunds + (totals?.transferAdjustment ?? 0);

		let status: PeriodCarouselStatus = "closed";
		if (comparePeriods(period, currentPeriod) > 0) {
			status = "future";
		} else if (comparePeriods(period, currentPeriod) === 0) {
			status = "open";
		}

		return {
			period,
			amount: balance,
			incomes,
			expenses,
			status,
		};
	});
}
