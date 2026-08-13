import {
	and,
	count,
	desc,
	eq,
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
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
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

	return enrichTransactionsWithTransferPeers(
		mapTransactionRows(transactionRows),
	);
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
			where: and(
				eq(cards.userId, dataOwnerUserId),
				eq(cards.status, "Ativo"),
			),
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

type PeriodOverviewRow = {
	periodo: string | null;
	tipo_transacao: string | null;
	total_amount: string | number | null;
	refund_amount: string | number | null;
	conta_excluir_do_saldo: boolean | null;
};

export async function fetchTransactionsMonthSummaries(
	userId: string,
): Promise<PeriodCarouselMonth[]> {
	const [adminPayerId, dataOwnerUserId] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
	]);
	if (!adminPayerId) {
		return [];
	}

	const currentPeriod = getCurrentPeriod();
	const endPeriod = addMonthsToPeriod(currentPeriod, 2);
	const startPeriod = addMonthsToPeriod(currentPeriod, -24);

	const rows = await callRpc<PeriodOverviewRow>("get_period_overview", {
		p_user_id: dataOwnerUserId,
		p_admin_payer_id: adminPayerId,
		p_start_period: startPeriod,
		p_end_period: endPeriod,
	});

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
