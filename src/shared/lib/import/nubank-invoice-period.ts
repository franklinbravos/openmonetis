import {
	derivePeriodFromDate,
	formatPeriod,
	parsePeriod,
} from "@/shared/utils/period";

/** Vencimento em fev → fatura de jan (referência Nubank). */
export function deriveNubankInvoicePeriodFromDueDate(dueDate: string): string {
	const { year, month } = parsePeriod(derivePeriodFromDate(dueDate));
	const invoiceMonth = month === 1 ? 12 : month - 1;
	const invoiceYear = month === 1 ? year - 1 : year;
	return formatPeriod(invoiceYear, invoiceMonth);
}

/** Período de referência: fim do ciclo (Período vigente / TRANSAÇÕES … A DD MMM). */
export function resolveNubankInvoicePeriod(input: {
	billingWindowEndDate?: string | null;
	dueDate?: string | null;
}): string | null {
	if (input.billingWindowEndDate) {
		return derivePeriodFromDate(input.billingWindowEndDate);
	}

	if (input.dueDate) {
		return deriveNubankInvoicePeriodFromDueDate(input.dueDate);
	}

	return null;
}
