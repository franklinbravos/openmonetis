import { eq } from "drizzle-orm";
import { categories } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { CATEGORY_COLORS } from "@/shared/utils/category-colors";
import { safeToNumber as toNumber } from "@/shared/utils/number";
import {
	addMonthsToPeriod,
	buildPeriodWindow,
	formatPeriodMonthShort,
} from "@/shared/utils/period";

type CategoryOption = {
	id: string;
	name: string;
	icon: string | null;
	type: "receita" | "despesa";
};

type CategoryHistoryItem = {
	id: string;
	name: string;
	icon: string | null;
	color: string;
	data: Record<string, number>;
};

export type CategoryHistoryData = {
	months: string[]; // ["NOV", "DEZ", "JAN", ...]
	categories: CategoryHistoryItem[];
	chartData: Array<{
		month: string;
		[categoryName: string]: number | string;
	}>;
	allCategories: CategoryOption[];
};

const CHART_COLORS = CATEGORY_COLORS;

type CategoryHistoryRpcRow = {
	category_id: string;
	category_name: string;
	category_icon: string | null;
	period: string;
	total_amount: string | number | null;
};

type MonthlyCategoryRow = {
	categoryId: string;
	categoryName: string;
	categoryIcon: string | null;
	period: string;
	totalAmount: unknown;
};

const mapCategoryHistoryRow = (
	row: CategoryHistoryRpcRow,
): MonthlyCategoryRow => ({
	categoryId: row.category_id,
	categoryName: row.category_name,
	categoryIcon: row.category_icon,
	period: row.period,
	totalAmount: row.total_amount,
});

type UniqueCategory = {
	id: string;
	name: string;
	icon: string | null;
};

async function fetchAllCategories(userId: string): Promise<CategoryOption[]> {
	const result = await db
		.select({
			id: categories.id,
			name: categories.name,
			icon: categories.icon,
			type: categories.type,
		})
		.from(categories)
		.where(eq(categories.userId, userId))
		.orderBy(categories.type, categories.name);

	return result as CategoryOption[];
}

/**
 * Fetches category expense/income history for all categories with transactions
 * Widget will allow user to select up to 5 to display
 */
export async function fetchCategoryHistory(
	userId: string,
	currentPeriod: string,
): Promise<CategoryHistoryData> {
	// Generate last 8 months, current month, and next month (10 total)
	const periods = buildPeriodWindow(addMonthsToPeriod(currentPeriod, 1), 10);
	const monthLabels = periods.map((period) =>
		formatPeriodMonthShort(period).toUpperCase(),
	);

	// Fetch all categories for the selector
	const allCategories = await fetchAllCategories(userId);

	const adminPayerId = await getAdminPayerId(userId);

	if (!adminPayerId) {
		return {
			months: monthLabels,
			categories: [],
			chartData: monthLabels.map((month) => ({ month })),
			allCategories,
		};
	}

	// Fetch monthly data for ALL categories with transactions
	const monthlyDataQuery = (
		await callRpc<CategoryHistoryRpcRow>("get_category_history", {
			p_user_id: userId,
			p_admin_payer_id: adminPayerId,
			p_periods: periods,
		})
	).map(mapCategoryHistoryRow);

	if (monthlyDataQuery.length === 0) {
		return {
			months: monthLabels,
			categories: [],
			chartData: monthLabels.map((month) => ({ month })),
			allCategories,
		};
	}

	// Get unique categories from query results
	const uniqueCategories: UniqueCategory[] = Array.from(
		new Map<string, UniqueCategory>(
			monthlyDataQuery.map((row) => [
				row.categoryId,
				{
					id: row.categoryId,
					name: row.categoryName,
					icon: row.categoryIcon,
				},
			]),
		).values(),
	);

	// Transform data into chart-ready format
	const categoriesMap = new Map<
		string,
		{
			id: string;
			name: string;
			icon: string | null;
			color: string;
			data: Record<string, number>;
		}
	>();

	// Initialize ALL categories with transactions with all months set to 0
	uniqueCategories.forEach((cat, index) => {
		const monthData: Record<string, number> = {};
		periods.forEach((_period, periodIndex) => {
			monthData[monthLabels[periodIndex]] = 0;
		});

		categoriesMap.set(cat.id, {
			id: cat.id,
			name: cat.name,
			icon: cat.icon,
			color: CHART_COLORS[index % CHART_COLORS.length],
			data: monthData,
		});
	});

	// Fill in actual values from monthly data
	monthlyDataQuery.forEach((row) => {
		const category = categoriesMap.get(row.categoryId);
		if (category) {
			const periodIndex = periods.indexOf(row.period);
			if (periodIndex !== -1) {
				const monthLabel = monthLabels[periodIndex];
				category.data[monthLabel] = toNumber(row.totalAmount);
			}
		}
	});

	// Convert to chart data format
	const chartData: CategoryHistoryData["chartData"] = monthLabels.map(
		(month) => {
			const dataPoint: {
				month: string;
				[categoryName: string]: number | string;
			} = { month };

			categoriesMap.forEach((category) => {
				dataPoint[category.name] = category.data[month];
			});

			return dataPoint;
		},
	);

	return {
		months: monthLabels,
		categories: Array.from(categoriesMap.values()),
		chartData,
		allCategories,
	};
}
