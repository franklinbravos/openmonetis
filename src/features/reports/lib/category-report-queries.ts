import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import type {
	CategoryReportData,
	CategoryReportFilters,
	CategoryReportItem,
	MonthlyData,
} from "@/shared/lib/types/reports";
import { safeToNumber as toNumber } from "@/shared/utils/number";
import { calculatePercentageChange, generatePeriodRange } from "./utils";

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

export function buildCategoryReportData(
	rows: CategoryTotalsRow[],
	periods: string[],
): CategoryReportData {
	const categoryMap = new Map<string, CategoryReportItem>();
	const periodTotalsMap = new Map<string, number>();

	// Initialize period totals
	for (const period of periods) {
		periodTotalsMap.set(period, 0);
	}

	// Process each row
	for (const row of rows) {
		const amount = Math.abs(toNumber(row.total));
		const { categoryId, categoryName, categoryIcon, categoryType, period } =
			row;

		// Get or create category item
		if (!categoryMap.has(categoryId)) {
			categoryMap.set(categoryId, {
				categoryId,
				name: categoryName,
				icon: categoryIcon,
				type: categoryType as "despesa" | "receita",
				monthlyData: new Map<string, MonthlyData>(),
				total: 0,
			});
		}

		const categoryItem = categoryMap.get(categoryId);
		if (!categoryItem) continue;

		// Add monthly data (will calculate percentage later)
		categoryItem.monthlyData.set(period, {
			period,
			amount,
			previousAmount: 0, // Will be filled in next step
			percentageChange: null, // Will be calculated in next step
		});

		// Update category total
		categoryItem.total += amount;

		// Update period total
		const currentPeriodTotal = periodTotalsMap.get(period) ?? 0;
		periodTotalsMap.set(period, currentPeriodTotal + amount);
	}

	// Calculate percentage changes (compare with previous period)
	for (const categoryItem of categoryMap.values()) {
		const sortedPeriods = Array.from(categoryItem.monthlyData.keys()).sort();

		for (let i = 0; i < sortedPeriods.length; i++) {
			const period = sortedPeriods[i];
			const monthlyData = categoryItem.monthlyData.get(period);
			if (!monthlyData) continue;

			if (i > 0) {
				// Get previous period data
				const prevPeriod = sortedPeriods[i - 1];
				const prevMonthlyData = categoryItem.monthlyData.get(prevPeriod);
				const previousAmount = prevMonthlyData?.amount ?? 0;

				// Update with previous amount and calculate percentage
				monthlyData.previousAmount = previousAmount;
				monthlyData.percentageChange = calculatePercentageChange(
					monthlyData.amount,
					previousAmount,
				);
			} else {
				// First period - no comparison
				monthlyData.previousAmount = 0;
				monthlyData.percentageChange = null;
			}
		}
	}

	// Fill in missing periods with zero values
	for (const categoryItem of categoryMap.values()) {
		for (const period of periods) {
			if (!categoryItem.monthlyData.has(period)) {
				// Find previous period data for percentage calculation
				const periodIndex = periods.indexOf(period);
				let previousAmount = 0;

				if (periodIndex > 0) {
					const prevPeriod = periods[periodIndex - 1];
					const prevData = categoryItem.monthlyData.get(prevPeriod);
					previousAmount = prevData?.amount ?? 0;
				}

				categoryItem.monthlyData.set(period, {
					period,
					amount: 0,
					previousAmount,
					percentageChange: calculatePercentageChange(0, previousAmount),
				});
			}
		}
	}

	// Convert to array and sort
	const categoryList = Array.from(categoryMap.values());

	// Sort: despesas first (by total desc), then receitas (by total desc)
	categoryList.sort((a, b) => {
		// First by type: despesa comes before receita
		if (a.type !== b.type) {
			return a.type === "despesa" ? -1 : 1;
		}
		// Then by total (descending)
		return b.total - a.total;
	});

	// Calculate grand total
	let grandTotal = 0;
	for (const categoryItem of categoryList) {
		grandTotal += categoryItem.total;
	}

	return {
		categories: categoryList,
		periods,
		totals: periodTotalsMap,
		grandTotal,
	};
}

/**
 * Fetches category report data for multiple periods
 *
 * @param userId - User ID to filter data
 * @param filters - Report filters (startPeriod, endPeriod, categoryIds)
 * @returns Complete category report data
 */
export async function fetchCategoryReport(
	userId: string,
	filters: CategoryReportFilters,
): Promise<CategoryReportData> {
	const { startPeriod, endPeriod, categoryIds } = filters;

	// Generate all periods in the range
	const periods = generatePeriodRange(startPeriod, endPeriod);

	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) {
		return { categories: [], periods, totals: new Map(), grandTotal: 0 };
	}

	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const rows = (
		await callRpc<CategoryTotalsRpcRow>("get_category_totals", {
			p_user_id: dataOwnerUserId,
			p_admin_payer_id: adminPayerId,
			p_periods: periods,
			p_category_ids: categoryIds ?? [],
			p_use_abs: false,
		})
	).map(mapCategoryTotalsRow);

	return buildCategoryReportData(rows, periods);
}
