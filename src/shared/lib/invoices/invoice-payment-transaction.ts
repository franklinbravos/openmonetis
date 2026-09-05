import {
	ACCOUNT_AUTO_INVOICE_NOTE_PREFIX,
	isInvoiceAmortizationNote,
	parseInvoicePaymentNoteCardId,
	parseInvoicePaymentNotePeriod,
} from "@/shared/lib/accounts/constants";

export type InvoicePaymentCardSnapshot = {
	id: string;
	name: string;
	logo?: string | null;
	brand?: string | null;
};

export type InvoicePaymentTransactionMeta = {
	cardId: string;
	period: string;
	cardName: string | null;
	cardLogo: string | null;
	cardBrand: string | null;
	isAmortization: boolean;
};

export function isInvoicePaymentTransaction(
	note: string | null | undefined,
): boolean {
	return Boolean(note?.startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX));
}

export function collectInvoicePaymentCardIds(
	rows: Array<{ note?: string | null }>,
): string[] {
	const ids = new Set<string>();
	for (const row of rows) {
		const cardId = parseInvoicePaymentNoteCardId(row.note);
		if (cardId) {
			ids.add(cardId);
		}
	}
	return [...ids];
}

export function resolveInvoicePaymentTransactionMeta(
	note: string | null | undefined,
	cardsById?: Map<string, InvoicePaymentCardSnapshot>,
): InvoicePaymentTransactionMeta | null {
	const cardId = parseInvoicePaymentNoteCardId(note);
	const period = parseInvoicePaymentNotePeriod(note);
	if (!cardId || !period) {
		return null;
	}

	const card = cardsById?.get(cardId);

	return {
		cardId,
		period,
		cardName: card?.name ?? null,
		cardLogo: card?.logo ?? null,
		cardBrand: card?.brand ?? null,
		isAmortization: isInvoiceAmortizationNote(note),
	};
}

export function buildCardInvoiceHref(cardId: string, period: string): string {
	const params = new URLSearchParams({ periodo: period });
	return `/cards/${cardId}/invoice?${params.toString()}`;
}
