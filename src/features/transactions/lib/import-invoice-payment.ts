import type { SelectOption } from "@/features/transactions/components/types";
import { deriveCreditCardPeriod } from "@/features/transactions/lib/form-helpers";

const INVOICE_PAYMENT_PATTERNS = [
	/pgto\s+fatura/i,
	/pagamento\s+(efetuado\s+)?pagamento\s+fatura/i,
	/^pagamento\s+fatura/i,
	/pagto\s+fatura/i,
	/^pagamento\s+recebido$/i,
];

export function isInvoicePaymentDescription(description: string): boolean {
	const normalized = description.trim();
	return INVOICE_PAYMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function guessInvoicePaymentCardId(
	description: string,
	cardOptions: SelectOption[],
): string | null {
	const normalized = description.toLowerCase();

	const sorted = [...cardOptions].sort(
		(a, b) => b.label.length - a.label.length,
	);

	for (const card of sorted) {
		const label = card.label.trim().toLowerCase();
		if (label.length < 3) continue;
		if (normalized.includes(label)) return card.value;
	}

	return null;
}

export function guessInvoicePaymentPeriod(
	paymentDate: string,
	cardOptions: SelectOption[],
	cardId: string | null,
): string | null {
	if (!cardId) return null;

	const card = cardOptions.find((option) => option.value === cardId);
	if (!card) return null;

	return deriveCreditCardPeriod(paymentDate, card.closingDay, card.dueDay);
}
