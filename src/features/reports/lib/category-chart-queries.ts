import { eq } from "drizzle-orm";
import { categories } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { safeToNumber as toNumber } from "@/shared/utils/number";
import { formatPeriodMonthShort } from "@/shared/utils/period";
import { generatePeriodRange } from "./utils";

type CategoryTotalsRpcRow = {
	category_id: string;
	category_name: string;
	category_icon: string | null;
	category_type: string;
	period: string;
	total: unknown;
};

type CategoryTotalsRow = {
	categoryId: string;
	categoryName: string;
	categoryIcon: string | null;
	categoryType: string;
	period: string;
	total: unknown;
};

const mapCategoryTotalsRow = (
	row: CategoryTotalsRpcRow,
): CategoryTotalsRow => ({
	categoryId: row.category_id,
	categoryName: row.category_name,
	categoryIcon: row.category_icon,
	categoryType: row.category_type,
	period: row.period,
	total: row.total,
});

export type CategoryChartData = {
	months: string[]; // Short month labels (e.g., "JAN", "FEV")
	categories: Array<{
		id: string;
		name: string;
		icon: string | null;
		type: "despesa" | "receita";
	}>;
	chartData: Array<{
		month: string;
		[categoryName: string]: number | string;
	}>;
	allCategories: Array<{
		id: string;
		name: string;
		icon: string | null;
		type: "despesa" | "receita";
	}>;
};

export async function fetchCategoryChartData(
	userId: string,
	startPeriod: string,
	endPeriod: string,
	categoryIds?: string[],
): Promise<CategoryChartData> {
	const periods = generatePeriodRange(startPeriod, endPeriod);

	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) {
		return { months: [], categories: [], chartData: [], allCategories: [] };
	}

	const [rawRows, allCategoriesRows] = await Promise.all([
		callRpc<CategoryTotalsRpcRow>("get_category_totals", {
			p_user_id: userId,
			p_admin_payer_id: adminPayerId,
			p_periods: periods,
			p_category_ids: categoryIds ?? [],
			p_use_abs: true,
		}),
		db
			.select({
				id: categories.id,
				name: categories.name,
				icon: categories.icon,
				type: categories.type,
			})
			.from(categories)
			.where(eq(categories.userId, userId))
			.orderBy(categories.type, categories.name),
	]);

	const rows = rawRows.map(mapCategoryTotalsRow);

	const allCategories = allCategoriesRows.map(
		(cat: { id: string; name: string; icon: string | null; type: string }) => ({
			id: cat.id,
			name: cat.name,
			icon: cat.icon,
			type: cat.type as "despesa" | "receita",
		}),
	);

	const categoryMap = new Map<
		string,
		{
			id: string;
			name: string;
			icon: string | null;
			type: "despesa" | "receita";
			dataByPeriod: Map<string, number>;
		}
	>();

	for (const row of rows) {
		const amount = Math.abs(toNumber(row.total));
		const { categoryId, categoryName, categoryIcon, categoryType, period } =
			row;

		if (!categoryMap.has(categoryId)) {
			categoryMap.set(categoryId, {
				id: categoryId,
				name: categoryName,
				icon: categoryIcon,
				type: categoryType as "despesa" | "receita",
				dataByPeriod: new Map(),
			});
		}

		categoryMap.get(categoryId)?.dataByPeriod.set(period, amount);
	}

	const chartData = periods.map((period) => {
		const monthLabel = formatPeriodMonthShort(period).toUpperCase();

		const dataPoint: { month: string; [key: string]: number | string } = {
			month: monthLabel,
		};

		for (const category of categoryMap.values()) {
			dataPoint[category.name] = category.dataByPeriod.get(period) ?? 0;
		}

		return dataPoint;
	});

	const months = periods.map((period) =>
		formatPeriodMonthShort(period).toUpperCase(),
	);

	const categoryList = Array.from(categoryMap.values()).map((cat) => ({
		id: cat.id,
		name: cat.name,
		icon: cat.icon,
		type: cat.type,
	}));

	return { months, categories: categoryList, chartData, allCategories };
}
