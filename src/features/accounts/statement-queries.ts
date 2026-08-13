import { and, eq, type SQL } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import {
	fetchTransactionsPageWithRelations,
	fetchTransactionsWithRelations,
} from "@/features/transactions/queries";
import type {
	PeriodCarouselMonth,
	PeriodCarouselStatus,
} from "@/shared/components/month-picker/period-carousel-types";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc, callRpcOne } from "@/shared/lib/supabase/rpc";
import { safeToNumber } from "@/shared/utils/number";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	comparePeriods,
	getCurrentPeriod,
} from "@/shared/utils/period";

type AccountSummaryData = {
	openingBalance: number;
	currentBalance: number;
	totalIncomes: number;
	totalExpenses: number;
};

type StatementSummariesRow = {
	periodo: string | null;
	net_amount: string | number | null;
	incomes: string | number | null;
	expenses: string | number | null;
};

type StatementSummaryRow = {
	net_amount: string | number | null;
	incomes: string | number | null;
	expenses: string | number | null;
	previous_movements: string | number | null;
};

export async function fetchAccountData(userId: string, accountId: string) {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const account = await db.query.financialAccounts.findFirst({
		columns: {
			id: true,
			name: true,
			accountType: true,
			status: true,
			initialBalance: true,
			logo: true,
			note: true,
		},
		where: and(
			eq(financialAccounts.id, accountId),
			eq(financialAccounts.userId, dataOwnerUserId),
		),
	});

	return account;
}

export async function fetchAccountStatementMonthSummaries(
	userId: string,
	accountId: string,
): Promise<PeriodCarouselMonth[]> {
	const account = await fetchAccountData(userId, accountId);
	if (!account) {
		return [];
	}

	const [adminPayerId, dataOwnerUserId] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
	]);
	if (!adminPayerId) {
		return [];
	}

	const periodRows = await callRpc<StatementSummariesRow>(
		"get_account_statement_summaries",
		{
			p_user_id: dataOwnerUserId,
			p_account_id: accountId,
			p_admin_payer_id: adminPayerId,
		},
	);

	const netByPeriod = new Map<string, number>();
	const incomesByPeriod = new Map<string, number>();
	const expensesByPeriod = new Map<string, number>();
	for (const row of periodRows) {
		if (!row.periodo) continue;
		netByPeriod.set(row.periodo, safeToNumber(row.net_amount));
		incomesByPeriod.set(row.periodo, safeToNumber(row.incomes));
		const expenseNet = safeToNumber(row.expenses);
		expensesByPeriod.set(row.periodo, Math.max(0, -expenseNet));
	}

	const currentPeriod = getCurrentPeriod();
	const endPeriod = addMonthsToPeriod(currentPeriod, 2);
	const startPeriod =
		netByPeriod.size > 0
			? Array.from(netByPeriod.keys()).sort((left, right) =>
					comparePeriods(left, right),
				)[0]
			: addMonthsToPeriod(currentPeriod, -5);

	const periodRange = buildPeriodRange(startPeriod ?? currentPeriod, endPeriod);

	const initialBalance = safeToNumber(account.initialBalance);
	let runningBalance = initialBalance;
	const balanceByPeriod = new Map<string, number>();

	for (const period of periodRange) {
		if (netByPeriod.has(period)) {
			runningBalance += netByPeriod.get(period) ?? 0;
		}
		balanceByPeriod.set(period, runningBalance);
	}

	return periodRange.map((period) => {
		let status: PeriodCarouselStatus = "closed";
		if (comparePeriods(period, currentPeriod) > 0) {
			status = "future";
		} else if (comparePeriods(period, currentPeriod) === 0) {
			status = "open";
		}

		return {
			period,
			amount: balanceByPeriod.get(period) ?? runningBalance,
			incomes: incomesByPeriod.get(period) ?? 0,
			expenses: expensesByPeriod.get(period) ?? 0,
			status,
		};
	});
}

export async function fetchAccountSummary(
	userId: string,
	accountId: string,
	selectedPeriod: string,
): Promise<AccountSummaryData> {
	const account = await fetchAccountData(userId, accountId);
	if (!account) {
		throw new Error("Account not found");
	}

	const [adminPayerId, dataOwnerUserId] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
	]);
	if (!adminPayerId) {
		const initialBalance = safeToNumber(account.initialBalance);
		return {
			openingBalance: initialBalance,
			currentBalance: initialBalance,
			totalIncomes: 0,
			totalExpenses: 0,
		};
	}

	const summary = await callRpcOne<StatementSummaryRow>(
		"get_account_statement_summary",
		{
			p_user_id: dataOwnerUserId,
			p_account_id: accountId,
			p_admin_payer_id: adminPayerId,
			p_period: selectedPeriod,
		},
	);

	const initialBalance = safeToNumber(account.initialBalance);
	const previousMovements = safeToNumber(summary?.previous_movements);
	const openingBalance = initialBalance + previousMovements;
	const netAmount = safeToNumber(summary?.net_amount);
	const totalIncomes = safeToNumber(summary?.incomes);
	const expenseNet = safeToNumber(summary?.expenses);
	const totalExpenses = Math.max(0, -expenseNet);
	const currentBalance = openingBalance + netAmount;

	return {
		openingBalance,
		currentBalance,
		totalIncomes,
		totalExpenses,
	};
}

export async function fetchAccountTransactions(
	filters: SQL[],
	settledOnly = true,
) {
	const extraFilters = settledOnly ? [eq(transactions.isSettled, true)] : [];

	return fetchTransactionsWithRelations({
		filters,
		extraFilters,
		excludeInitialBalanceFromIncome: false,
	});
}

export async function fetchAccountTransactionsPage(
	filters: SQL[],
	{
		page,
		pageSize,
	}: {
		page: number;
		pageSize: number;
	},
	settledOnly = true,
) {
	const extraFilters = settledOnly ? [eq(transactions.isSettled, true)] : [];

	return fetchTransactionsPageWithRelations({
		filters,
		extraFilters,
		excludeInitialBalanceFromIncome: false,
		page,
		pageSize,
	});
}
