import { and, asc, eq } from "drizzle-orm";
import { budgets, categories } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc, callRpcOne } from "@/shared/lib/supabase/rpc";

const toNumber = (value: string | number | null | undefined) => {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = Number.parseFloat(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
};

type BudgetData = {
	id: string;
	amount: number;
	spent: number;
	period: string;
	createdAt: string;
	category: {
		id: string;
		name: string;
		icon: string | null;
	} | null;
};

type CategoryOption = {
	id: string;
	name: string;
	icon: string | null;
};

type BudgetSpentRpcRow = {
	category_id: string;
	total_amount: string | null;
};

type BudgetSpentRow = {
	categoryId: string;
	totalAmount: string | null;
};

type BudgetSummaryRpcRow = {
	total_amount: string | null;
};

type BudgetSummaryRow = {
	totalAmount: string | null;
};

const mapBudgetSpentRow = (row: BudgetSpentRpcRow): BudgetSpentRow => ({
	categoryId: row.category_id,
	totalAmount: row.total_amount,
});

const mapBudgetSummaryRow = (row: BudgetSummaryRpcRow): BudgetSummaryRow => ({
	totalAmount: row.total_amount,
});

export async function fetchBudgetsForUser(
	userId: string,
	selectedPeriod: string,
): Promise<{
	budgets: BudgetData[];
	categoriesOptions: CategoryOption[];
}> {
	const adminPayerId = await getAdminPayerId(userId);

	const [budgetRows, categoryRows] = await Promise.all([
		db.query.budgets.findMany({
			where: and(
				eq(budgets.userId, userId),
				eq(budgets.period, selectedPeriod),
			),
			with: {
				category: true,
			},
		}),
		db.query.categories.findMany({
			columns: {
				id: true,
				name: true,
				icon: true,
			},
			where: and(eq(categories.userId, userId), eq(categories.type, "despesa")),
			orderBy: asc(categories.name),
		}),
	]);

	const categoryIds = budgetRows
		.map((budget) => budget.categoryId)
		.filter((id: string | null): id is string => Boolean(id));

	let totalsByCategory = new Map<string, number>();

	if (categoryIds.length > 0 && adminPayerId) {
		const totals = (
			await callRpc<BudgetSpentRpcRow>("get_budget_spent_by_category", {
				p_user_id: userId,
				p_admin_payer_id: adminPayerId,
				p_period: selectedPeriod,
				p_category_ids: categoryIds,
			})
		).map(mapBudgetSpentRow);

		totalsByCategory = new Map(
			totals.map((row) => [
				row.categoryId,
				Math.abs(toNumber(row.totalAmount)),
			]),
		);
	}

	const budgetList = budgetRows
		.map((budget) => ({
			id: budget.id,
			amount: toNumber(budget.amount),
			spent: totalsByCategory.get(budget.categoryId ?? "") ?? 0,
			period: budget.period,
			createdAt: budget.createdAt.toISOString(),
			category: (() => {
				type Cat = { id: string; name: string; icon: string | null };
				const cat = budget.category as Cat | null | undefined;
				return cat ? { id: cat.id, name: cat.name, icon: cat.icon } : null;
			})(),
		}))
		.sort((a, b) =>
			(a.category?.name ?? "").localeCompare(b.category?.name ?? "", "pt-BR", {
				sensitivity: "base",
			}),
		);

	const categoriesOptions = categoryRows.map((category) => ({
		id: category.id,
		name: category.name,
		icon: category.icon,
	}));

	return { budgets: budgetList, categoriesOptions };
}

export type CategoryBudgetSummary = {
	amount: number;
	spent: number;
};

export async function fetchCategoryBudgetSummary(
	userId: string,
	categoryId: string,
	period: string,
): Promise<CategoryBudgetSummary | null> {
	const [adminPayerId, budget] = await Promise.all([
		getAdminPayerId(userId),
		db.query.budgets.findFirst({
			columns: { amount: true },
			where: and(
				eq(budgets.userId, userId),
				eq(budgets.categoryId, categoryId),
				eq(budgets.period, period),
			),
		}),
	]);

	if (!adminPayerId || !budget) return null;

	const totalsRow = await callRpcOne<BudgetSummaryRpcRow>(
		"get_category_budget_summary",
		{
			p_user_id: userId,
			p_category_id: categoryId,
			p_admin_payer_id: adminPayerId,
			p_period: period,
		},
	);

	const summaryRow = totalsRow ? mapBudgetSummaryRow(totalsRow) : null;

	return {
		amount: toNumber(budget.amount),
		spent: Math.abs(toNumber(summaryRow?.totalAmount ?? 0)),
	};
}
