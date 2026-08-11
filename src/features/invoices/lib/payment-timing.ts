import {
	compareDateOnly,
	parseUtcDateString,
	toDateOnlyString,
} from "@/shared/utils/date";
import { buildDueDateInfoFromPeriodDay } from "@/shared/utils/financial-dates";

export type InvoicePaymentTiming = {
	paymentDate: string;
	dueDate: string;
	effectiveDueDate: string;
	isLate: boolean;
	dueDateAdjustedForWeekend: boolean;
	lateDays: number;
};

function advanceToNextBusinessDateOnly(value: string): string {
	const parsed = parseUtcDateString(value);
	if (!parsed) {
		return value;
	}

	const next = new Date(parsed.getTime());
	while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
		next.setUTCDate(next.getUTCDate() + 1);
	}

	return toDateOnlyString(next) ?? value;
}

function countCalendarDaysBetween(start: string, end: string): number {
	const startDate = parseUtcDateString(start);
	const endDate = parseUtcDateString(end);
	if (!startDate || !endDate) {
		return 0;
	}

	return Math.round(
		(endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
	);
}

export function resolveInvoicePaymentTiming(
	paymentDate: string | Date | null | undefined,
	period: string,
	dueDay: string,
): InvoicePaymentTiming | null {
	const normalizedPaymentDate = toDateOnlyString(paymentDate);
	if (!normalizedPaymentDate) {
		return null;
	}

	const dueInfo = buildDueDateInfoFromPeriodDay(period, dueDay);
	const dueDate = dueInfo.date;
	if (!dueDate) {
		return null;
	}

	const effectiveDueDate = advanceToNextBusinessDateOnly(dueDate);
	const dueDateAdjustedForWeekend = effectiveDueDate !== dueDate;
	const isLate = compareDateOnly(normalizedPaymentDate, effectiveDueDate) > 0;
	const lateDays = isLate
		? countCalendarDaysBetween(effectiveDueDate, normalizedPaymentDate)
		: 0;

	return {
		paymentDate: normalizedPaymentDate,
		dueDate,
		effectiveDueDate,
		isLate,
		dueDateAdjustedForWeekend,
		lateDays,
	};
}
