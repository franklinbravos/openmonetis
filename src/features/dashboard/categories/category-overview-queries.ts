import { and, eq } from "drizzle-orm";
import { budgets, categories } from "@/db/schema";
import {
	buildCategoryBreakdownData,
	type DashboardCategoryBreakdownData,
} from "@/features/dashboard/categories/category-breakdown-helpers";
import type { ExpensesByCategoryData } from "@/features/dashboard/categories/expenses-by-category-queries";
import type { IncomeByCategoryData } from "@/features/dashboard/categories/income-by-category-queries";
import type {
	GoalProgressCategory,
	GoalProgressItem,
	GoalsProgressData,
} from "@/features/dashboard/goals-progress/goals-progress-queries";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { safeToNumber as toNumber } from "@/shared/utils/number";
import { getPreviousPeriod } from "@/shared/utils/period";

const BUDGET_CRITICAL_THRESHOLD = 80;

type CategoryOverviewRpcRow = {
	category_id: string;
	category_name: string;
	category_icon: string | null;
	category_type: string | null;
	period: string | null;
	condition: string;
	total: string | number | null;
	absolute_total: string | number | null;
};

type CategorySnapshotRow = {
	categoryId: string;
	categoryName: string;
	categoryIcon: string | null;
	categoryType: string | null;
	period: string | null;
	condition: string;
	total: unknown;
	absoluteTotal: unknown;
};

const mapCategoryOverviewRow = (
	row: CategoryOverviewRpcRow,
): CategorySnapshotRow => ({
	categoryId: row.category_id,
	categoryName: row.category_name,
	categoryIcon: row.category_icon,
	categoryType: row.category_type,
	period: row.period,
	condition: row.condition,
	total: row.total,
	absoluteTotal: row.absolute_total,
});

type BudgetSnapshotRow = {
	budgetId: string;
	categoryId: string | null;
	categoryName: string;
	categoryIcon: string | null;
	period: string;
	createdAt: Date;
	amount: string | number | null;
};

type DashboardCategoryOverview = {
	goalsProgressData: GoalsProgressData;
	incomeByCategoryData: IncomeByCategoryData;
	expensesByCategoryData: ExpensesByCategoryData;
};

const resolveStatus = (usedPercentage: number): GoalProgressItem["status"] => {
	if (usedPercentage >= 100) {
		return "exceeded";
	}

	if (usedPercentage >= BUDGET_CRITICAL_THRESHOLD) {
		return "critical";
	}

	return "on-track";
};

const emptyOverview = (): DashboardCategoryOverview => ({
	goalsProgressData: {
		items: [],
		categories: [],
		totalBudgets: 0,
		exceededCount: 0,
		criticalCount: 0,
	},
	incomeByCategoryData: {
		categories: [],
		currentTotal: 0,
		previousTotal: 0,
	},
	expensesByCategoryData: {
		categories: [],
		currentTotal: 0,
		previousTotal: 0,
	},
});

const aggregateCategoryRows = (
	rows: CategorySnapshotRow[],
	categoryType: "receita" | "despesa",
) => {
	const grouped = new Map<
		string,
		{
			categoryId: string;
			categoryName: string;
			categoryIcon: string | null;
			period: string | null;
			total: number;
		}
	>();

	for (const row of rows) {
		if (row.categoryType !== categoryType) {
			continue;
		}

		const key = `${row.categoryId}:${row.period ?? "sem-periodo"}`;
		const current = grouped.get(key) ?? {
			categoryId: row.categoryId,
			categoryName: row.categoryName,
			categoryIcon: row.categoryIcon,
			period: row.period,
			total: 0,
		};

		current.total += toNumber(row.total);
		grouped.set(key, current);
	}

	return Array.from(grouped.values());
};

export async function fetchDashboardCategoryOverview(
	userId: string,
	period: string,
): Promise<DashboardCategoryOverview> {
	const [adminPayerId, dataOwnerUserId] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
	]);
	if (!adminPayerId) {
		return emptyOverview();
	}

	const previousPeriod = getPreviousPeriod(period);

	const [rawTransactionRows, budgetRows, categoryRows] = await Promise.all([
		callRpc<CategoryOverviewRpcRow>("get_category_overview", {
			p_user_id: dataOwnerUserId,
			p_admin_payer_id: adminPayerId,
			p_periods: [period, previousPeriod],
		}),
		db
			.select({
				budgetId: budgets.id,
				categoryId: budgets.categoryId,
				categoryName: categories.name,
				categoryIcon: categories.icon,
				period: budgets.period,
				createdAt: budgets.createdAt,
				amount: budgets.amount,
			})
			.from(budgets)
			.innerJoin(categories, eq(budgets.categoryId, categories.id))
			.where(
				and(eq(budgets.userId, dataOwnerUserId), eq(budgets.period, period)),
			),
		db.query.categories.findMany({
			where: and(
				eq(categories.userId, dataOwnerUserId),
				eq(categories.type, "despesa"),
			),
			orderBy: (category, { asc }) => [asc(category.name)],
		}),
	]);

	const transactionRows = rawTransactionRows.map(mapCategoryOverviewRow);

	const incomeRows = aggregateCategoryRows(transactionRows, "receita");
	const expenseRows = aggregateCategoryRows(transactionRows, "despesa");
	const budgetAmountRows = (budgetRows as BudgetSnapshotRow[]).map((row) => ({
		categoryId: row.categoryId,
		amount: row.amount,
	}));

	const incomeByCategoryData: DashboardCategoryBreakdownData =
		buildCategoryBreakdownData({
			rows: incomeRows,
			budgetRows: budgetAmountRows,
			period,
		});
	const expensesByCategoryData: DashboardCategoryBreakdownData =
		buildCategoryBreakdownData({
			rows: expenseRows,
			budgetRows: budgetAmountRows,
			period,
		});

	const currentExpenseMap = new Map<string, number>();
	for (const row of transactionRows) {
		if (
			row.categoryType === "despesa" &&
			row.period === period &&
			row.condition !== "cancelado"
		) {
			currentExpenseMap.set(
				row.categoryId,
				(currentExpenseMap.get(row.categoryId) ?? 0) +
					toNumber(row.absoluteTotal),
			);
		}
	}

	const goalsCategories: GoalProgressCategory[] = categoryRows.map(
		(category) => ({
			id: category.id,
			name: category.name,
			icon: category.icon,
		}),
	);

	const goalItems: GoalProgressItem[] = (budgetRows as BudgetSnapshotRow[])
		.map((row) => {
			const budgetAmount = toNumber(row.amount);
			const spentAmount = row.categoryId
				? (currentExpenseMap.get(row.categoryId) ?? 0)
				: 0;
			const usedPercentage =
				budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;

			return {
				id: row.budgetId,
				categoryId: row.categoryId,
				categoryName: row.categoryName,
				categoryIcon: row.categoryIcon,
				period: row.period,
				createdAt: row.createdAt.toISOString(),
				budgetAmount,
				spentAmount,
				usedPercentage,
				status: resolveStatus(usedPercentage),
			};
		})
		.sort((a, b) => b.usedPercentage - a.usedPercentage);

	const exceededCount = goalItems.filter(
		(item) => item.status === "exceeded",
	).length;
	const criticalCount = goalItems.filter(
		(item) => item.status === "critical",
	).length;

	return {
		goalsProgressData: {
			items: goalItems,
			categories: goalsCategories,
			totalBudgets: goalItems.length,
			exceededCount,
			criticalCount,
		},
		incomeByCategoryData,
		expensesByCategoryData,
	};
}
