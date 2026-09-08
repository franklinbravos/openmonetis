import { describe, expect, it } from "vitest";
import { buildInsightsComparisons } from "./period-comparisons";

describe("buildInsightsComparisons", () => {
	const fullMonthContext = {
		isCurrentMonth: false,
		isPartialPeriod: false,
		dayOfMonth: 30,
		daysInMonth: 30,
		daysElapsed: 30,
		daysRemaining: 0,
		progressPercent: 100,
		referenceDate: "2025-08-30",
	};

	const partialMonthContext = {
		isCurrentMonth: true,
		isPartialPeriod: true,
		dayOfMonth: 7,
		daysInMonth: 30,
		daysElapsed: 7,
		daysRemaining: 23,
		progressPercent: (7 / 30) * 100,
		referenceDate: "2025-09-07",
	};

	it("usa variação mês a mês quando o período está fechado", () => {
		const result = buildInsightsComparisons({
			period: "2025-08",
			periodContext: fullMonthContext,
			currentIncome: 5000,
			currentExpense: 3000,
			previousIncome: 4000,
			previousExpense: 4000,
		});

		expect(result.isMonthOverMonthReliable).toBe(true);
		expect(result.monthOverMonthExpenseChange).toBe(-25);
		expect(result.dailyPaceExpenseChangePercent).toBeNull();
	});

	it("não compara totais crus quando o mês está em andamento", () => {
		const result = buildInsightsComparisons({
			period: "2025-09",
			periodContext: partialMonthContext,
			currentIncome: 2000,
			currentExpense: 1000,
			previousIncome: 5000,
			previousExpense: 2000,
		});

		expect(result.isMonthOverMonthReliable).toBe(false);
		expect(result.monthOverMonthExpenseChange).toBeNull();
		expect(result.dailyAverageExpense).toBeCloseTo(1000 / 7, 2);
		expect(result.previousMonthDailyAverageExpense).toBeCloseTo(2000 / 31, 2);
		expect(result.dailyPaceExpenseChangePercent).toBeGreaterThan(0);
		expect(result.projectedMonthExpense).toBeCloseTo((1000 / 7) * 30, 1);
	});
});
