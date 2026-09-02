import type { SelectOption } from "@/features/transactions/components/types";
import { deriveInvoicePaymentPeriod } from "@/features/transactions/lib/form-helpers";

const INVOICE_PAYMENT_PATTERNS = [
	/pgto\s+fatura/i,
	/pagamento\s+(efetuado\s+)?pagamento\s+fatura/i,
	/^pagamento\s+fatura/i,
	// Como o extrato do Nubank escreve: "Pagamento de fatura", com o "de" que os
	// outros padrões não previam. Ancorado no início para não casar com estorno
	// ou com "referente a pagamento de fatura".
	/^pagamento\s+de\s+fatura/i,
	/pagto\s+fatura/i,
	/^pagamento\s+recebido$/i,
	// Como o extrato do Inter escreve o débito automático da fatura do cartão:
	// "Pagamento efetuado: Debito Automatico Fatura Cartao Inter". Não começa com
	// "pagamento de fatura", então nenhum dos padrões acima o alcançava e ele
	// entrava como despesa comum.
	/d[ée]bito\s+autom[áa]tico\s+fatura\s+cart[ãa]o/i,
];

export function isInvoicePaymentDescription(description: string): boolean {
	const normalized = description.trim();
	return INVOICE_PAYMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function shouldExcludeInvoicePaymentFromCardImport(input: {
	description: string;
	isCreditCardStatement: boolean;
}): boolean {
	return (
		input.isCreditCardStatement &&
		isInvoicePaymentDescription(input.description)
	);
}

export function sanitizeExcludedCardInvoicePaymentRow<
	T extends {
		description: string;
		kind: string;
		selected: boolean;
		invoicePaymentCardId: string | null;
		invoicePaymentPeriod: string | null;
	},
>(row: T, isCreditCardStatement: boolean): T {
	if (
		row.kind === "invoice_extra" ||
		!shouldExcludeInvoicePaymentFromCardImport({
			description: row.description,
			isCreditCardStatement,
		})
	) {
		return row;
	}

	return {
		...row,
		selected: false,
		kind: "transaction",
		invoicePaymentCardId: null,
		invoicePaymentPeriod: null,
	};
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

	return deriveInvoicePaymentPeriod(paymentDate, card.closingDay, card.dueDay);
}

export type InvoiceAmountCandidate = {
	cardId: string;
	period: string;
	/** Total da fatura, em módulo. */
	total: number;
	/** Vencimento efetivo do período, `YYYY-MM-DD`, quando o cartão declara. */
	dueDate: string | null;
};

/**
 * Acha a fatura que um pagamento do extrato quitou, pelo valor.
 *
 * A descrição do extrato do Nubank é só "Pagamento de fatura" — sem nome de
 * cartão, sem período. Mas o valor é uma chave forte: o pagamento de janeiro é
 * R$ 6.003,17, que é exatamente o total daquela fatura.
 *
 * Só devolve quando não há dúvida. Dois cartões com o mesmo total no mesmo mês é
 * ambiguidade, e chutar seria pior do que perguntar — o vínculo errado liquida a
 * fatura errada. Quando o empate é entre períodos do MESMO cartão, aí sim há
 * desempate: vence o vencimento mais próximo da data do pagamento.
 */
export function matchInvoicePaymentByAmount(input: {
	amount: number;
	paymentDate: string;
	candidates: InvoiceAmountCandidate[];
	/** Tolerância do arredondamento do banco. */
	tolerance?: number;
}): { cardId: string; period: string } | null {
	const tolerance = input.tolerance ?? 0.02;
	const amount = Math.abs(input.amount);

	const matches = input.candidates.filter(
		(candidate) => Math.abs(Math.abs(candidate.total) - amount) <= tolerance,
	);

	if (matches.length === 0) return null;
	if (matches.length === 1) {
		const only = matches[0];
		return only ? { cardId: only.cardId, period: only.period } : null;
	}

	// Cartões diferentes com o mesmo valor: não dá para saber qual foi.
	const distinctCards = new Set(matches.map((match) => match.cardId));
	if (distinctCards.size > 1) return null;

	const closest = matches.reduce((best, candidate) => {
		if (!best.dueDate) return candidate;
		if (!candidate.dueDate) return best;
		return distanceInDays(candidate.dueDate, input.paymentDate) <
			distanceInDays(best.dueDate, input.paymentDate)
			? candidate
			: best;
	});

	return { cardId: closest.cardId, period: closest.period };
}

function distanceInDays(left: string, right: string): number {
	const toTime = (value: string) => Date.parse(`${value}T00:00:00Z`);
	return Math.abs(toTime(left) - toTime(right)) / 86_400_000;
}
