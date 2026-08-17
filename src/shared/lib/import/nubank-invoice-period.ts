import { derivePeriodFromDate } from "@/shared/utils/period";

/** Período da fatura no OpenMonetis = mês de vencimento (igual à página /cards/.../invoice). */
export function deriveNubankInvoicePeriodFromDueDate(dueDate: string): string {
	return derivePeriodFromDate(dueDate);
}

/** Período de fatura de cartão Nubank (PDF/OFX). Não usar para extrato de conta. */
export function resolveNubankInvoicePeriod(input: {
	billingWindowEndDate?: string | null;
	dueDate?: string | null;
}): string | null {
	if (input.dueDate) {
		return derivePeriodFromDate(input.dueDate);
	}

	if (input.billingWindowEndDate) {
		return derivePeriodFromDate(input.billingWindowEndDate);
	}

	return null;
}
