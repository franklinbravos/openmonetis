import {
	getDaysInPeriod,
	getPreviousPeriod,
	type PeriodProgressContext,
} from "@/shared/utils/period";

export type InsightsComparisons = {
	isMonthOverMonthReliable: boolean;
	monthOverMonthIncomeChange: number | null;
	monthOverMonthExpenseChange: number | null;
	dailyAverageExpense: number | null;
	dailyAverageIncome: number | null;
	previousMonthDailyAverageExpense: number | null;
	previousMonthDailyAverageIncome: number | null;
	dailyPaceExpenseChangePercent: number | null;
	dailyPaceIncomeChangePercent: number | null;
	projectedMonthExpense: number | null;
	projectedMonthIncome: number | null;
	projectedExpenseChangeVsPreviousMonthPercent: number | null;
	projectedIncomeChangeVsPreviousMonthPercent: number | null;
};

function percentChange(current: number, baseline: number): number | null {
	if (Math.abs(baseline) <= 0.01) {
		return null;
	}
	return ((current - baseline) / Math.abs(baseline)) * 100;
}

export function buildInsightsComparisons({
	period,
	periodContext,
	currentIncome,
	currentExpense,
	previousIncome,
	previousExpense,
}: {
	period: string;
	periodContext: PeriodProgressContext;
	currentIncome: number;
	currentExpense: number;
	previousIncome: number;
	previousExpense: number;
}): InsightsComparisons {
	const previousPeriod = getPreviousPeriod(period);
	const previousMonthDays = getDaysInPeriod(previousPeriod);

	if (!periodContext.isPartialPeriod) {
		return {
			isMonthOverMonthReliable: true,
			monthOverMonthIncomeChange:
				percentChange(currentIncome, previousIncome) ?? 0,
			monthOverMonthExpenseChange:
				percentChange(currentExpense, previousExpense) ?? 0,
			dailyAverageExpense: periodContext.daysInMonth > 0
				? currentExpense / periodContext.daysInMonth
				: null,
			dailyAverageIncome: periodContext.daysInMonth > 0
				? currentIncome / periodContext.daysInMonth
				: null,
			previousMonthDailyAverageExpense:
				previousMonthDays > 0 ? previousExpense / previousMonthDays : null,
			previousMonthDailyAverageIncome:
				previousMonthDays > 0 ? previousIncome / previousMonthDays : null,
			dailyPaceExpenseChangePercent: null,
			dailyPaceIncomeChangePercent: null,
			projectedMonthExpense: null,
			projectedMonthIncome: null,
			projectedExpenseChangeVsPreviousMonthPercent: null,
			projectedIncomeChangeVsPreviousMonthPercent: null,
		};
	}

	const daysElapsed = periodContext.daysElapsed;
	const dailyAverageExpense =
		daysElapsed > 0 ? currentExpense / daysElapsed : null;
	const dailyAverageIncome = daysElapsed > 0 ? currentIncome / daysElapsed : null;
	const previousMonthDailyAverageExpense =
		previousMonthDays > 0 ? previousExpense / previousMonthDays : null;
	const previousMonthDailyAverageIncome =
		previousMonthDays > 0 ? previousIncome / previousMonthDays : null;

	const projectedMonthExpense =
		dailyAverageExpense != null
			? dailyAverageExpense * periodContext.daysInMonth
			: null;
	const projectedMonthIncome =
		dailyAverageIncome != null
			? dailyAverageIncome * periodContext.daysInMonth
			: null;

	return {
		isMonthOverMonthReliable: false,
		monthOverMonthIncomeChange: null,
		monthOverMonthExpenseChange: null,
		dailyAverageExpense,
		dailyAverageIncome,
		previousMonthDailyAverageExpense,
		previousMonthDailyAverageIncome,
		dailyPaceExpenseChangePercent:
			dailyAverageExpense != null && previousMonthDailyAverageExpense != null
				? percentChange(dailyAverageExpense, previousMonthDailyAverageExpense)
				: null,
		dailyPaceIncomeChangePercent:
			dailyAverageIncome != null && previousMonthDailyAverageIncome != null
				? percentChange(dailyAverageIncome, previousMonthDailyAverageIncome)
				: null,
		projectedMonthExpense,
		projectedMonthIncome,
		projectedExpenseChangeVsPreviousMonthPercent:
			projectedMonthExpense != null
				? percentChange(projectedMonthExpense, previousExpense)
				: null,
		projectedIncomeChangeVsPreviousMonthPercent:
			projectedMonthIncome != null
				? percentChange(projectedMonthIncome, previousIncome)
				: null,
	};
}
