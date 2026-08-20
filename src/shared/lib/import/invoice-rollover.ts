import { roundMoney } from "@/shared/lib/import/invoice-total";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";

/**
 * Linhas do rotativo que o banco lança na fatura seguinte a um pagamento
 * parcial. O "valor pendente" é o que sobrou da fatura anterior; juros e IOF
 * são o custo de ter rolado.
 */
const ROLLOVER_CARRY_PATTERNS = [
	/valor\s+pendente\s+do\s+m[êe]s\s+anterior/i,
	/saldo\s+(remanescente|anterior)\s+.*rotativ/i,
];

const ROLLOVER_CHARGE_PATTERNS = [
	/juros\s+.*rotativ/i,
	/iof\s+.*rotativ/i,
	/juros\s+de\s+pagamento\s+parcial/i,
	/iof\s+de\s+pagamento\s+parcial/i,
	/encargos?\s+.*rotativ/i,
];

export function isInvoiceRolloverCarryDescription(
	description: string,
): boolean {
	return ROLLOVER_CARRY_PATTERNS.some((pattern) => pattern.test(description));
}

export function isInvoiceRolloverChargeDescription(
	description: string,
): boolean {
	return ROLLOVER_CHARGE_PATTERNS.some((pattern) => pattern.test(description));
}

type RolloverRow = {
	description: string;
	amount: number;
};

/** Valor que sobrou da fatura anterior, somando as linhas de carrego. */
export function sumInvoiceRolloverCarry(rows: RolloverRow[]): number {
	return roundMoney(
		rows.reduce((total, row) => {
			if (!isInvoiceRolloverCarryDescription(row.description)) return total;
			return total + Math.abs(row.amount);
		}, 0),
	);
}

/** Juros e IOF cobrados por ter rolado a fatura. */
export function sumInvoiceRolloverCharges(rows: RolloverRow[]): number {
	return roundMoney(
		rows.reduce((total, row) => {
			if (!isInvoiceRolloverChargeDescription(row.description)) return total;
			return total + Math.abs(row.amount);
		}, 0),
	);
}

export type PreviousInvoiceSettlement = {
	/** Total da fatura anterior, como está cadastrado. */
	previousTotal: number;
	/** O que sobrou dela e entrou nesta fatura. */
	carriedOver: number;
	/** Quanto foi de fato pago na fatura anterior. */
	paidOnPrevious: number;
	paymentStatus: (typeof INVOICE_PAYMENT_STATUS)[keyof typeof INVOICE_PAYMENT_STATUS];
	/** Pagamento do arquivo que sobrou e amortiza a fatura atual. */
	amortizationOnCurrent: number;
};

/**
 * Quanto da fatura anterior foi pago, deduzido dos números do próprio arquivo.
 *
 * O arquivo não diz a qual fatura cada pagamento foi aplicado — e tentar deduzir
 * por data de vencimento erra: um mês pode ter o pagamento do vencimento e uma
 * amortização posterior, e o banco trata os dois de formas diferentes.
 *
 * Mas ele diz quanto NÃO foi pago: a linha "valor pendente do mês anterior" é o
 * resto da fatura passada. Então o pago é a diferença entre o total dela e esse
 * resto, e o que sobrar dos pagamentos do arquivo amortiza a fatura atual.
 *
 * A tolerância de um centavo absorve o arredondamento do próprio banco: em
 * junho o total de maio (6.525,24) menos o pendente (5.525,23) dá 1.000,01
 * contra uma linha de pagamento de 1.000,00.
 */
export function resolvePreviousInvoiceSettlement(input: {
	previousTotal: number;
	carriedOver: number;
	filePaymentsTotal: number;
}): PreviousInvoiceSettlement {
	const previousTotal = roundMoney(Math.abs(input.previousTotal));
	const carriedOver = roundMoney(Math.abs(input.carriedOver));
	const filePaymentsTotal = roundMoney(Math.abs(input.filePaymentsTotal));

	const paidOnPrevious = roundMoney(
		Math.min(previousTotal, Math.max(0, previousTotal - carriedOver)),
	);

	const paymentStatus =
		carriedOver <= 0.01
			? INVOICE_PAYMENT_STATUS.PAID
			: paidOnPrevious <= 0.01
				? INVOICE_PAYMENT_STATUS.PENDING
				: INVOICE_PAYMENT_STATUS.PARTIAL;

	return {
		previousTotal,
		carriedOver,
		paidOnPrevious,
		paymentStatus,
		amortizationOnCurrent: roundMoney(
			Math.max(0, filePaymentsTotal - paidOnPrevious),
		),
	};
}
