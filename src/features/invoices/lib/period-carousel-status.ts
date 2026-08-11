import type { PeriodCarouselStatus } from "@/shared/components/month-picker/period-carousel-types";
import {
	INVOICE_PAYMENT_STATUS,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";
import {
	buildDateOnlyStringFromPeriodDay,
	compareDateOnly,
	getBusinessDateString,
	isDateOnlyPast,
} from "@/shared/utils/date";
import { buildDueDateInfoFromPeriodDay } from "@/shared/utils/financial-dates";
import {
	addMonthsToPeriod,
	comparePeriods,
	getCurrentPeriod,
} from "@/shared/utils/period";

export function resolveInvoicePeriodCarouselStatus(
	period: string,
	paymentStatus: InvoicePaymentStatus | null | undefined,
	closingDay: string,
	dueDay: string,
	referenceDate = getBusinessDateString(),
): PeriodCarouselStatus {
	const currentPeriod = getCurrentPeriod();

	if (comparePeriods(period, addMonthsToPeriod(currentPeriod, 1)) > 0) {
		return "future";
	}

	if (paymentStatus === INVOICE_PAYMENT_STATUS.PAID) {
		return "paid";
	}

	const dueDate = buildDueDateInfoFromPeriodDay(period, dueDay).date;
	if (dueDate && isDateOnlyPast(dueDate)) {
		return "overdue";
	}

	const closingDate = buildDateOnlyStringFromPeriodDay(period, closingDay);
	if (
		closingDate &&
		compareDateOnly(referenceDate, closingDate) > 0 &&
		comparePeriods(period, currentPeriod) <= 0
	) {
		return "closed";
	}

	if (comparePeriods(period, currentPeriod) > 0) {
		return "future";
	}

	return "open";
}
