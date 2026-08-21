import { roundMoney } from "@/shared/lib/import/invoice-total";
import {
	INVOICE_PAYMENT_STATUS,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";

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
	/** Pagamentos que este arquivo declara. */
	filePaymentsTotal: number;
	/** Quanto foi de fato pago na fatura anterior. */
	paidOnPrevious: number;
	/**
	 * Status apurado, ou `null` quando o arquivo não traz evidência nenhuma —
	 * nem pagamento, nem carrego. Aí não há o que afirmar sobre a fatura
	 * anterior, e nada deve ser escrito.
	 */
	paymentStatus: InvoicePaymentStatus | null;
	/** Pagamento do arquivo que sobrou e amortiza a fatura atual. */
	amortizationOnCurrent: number;
	/**
	 * A evidência do arquivo fecha com o total cadastrado da fatura anterior?
	 *
	 * É a validação útil no caso quitado: o arquivo diz que se pagou X, e o
	 * cadastro da fatura anterior soma Y. Divergência aponta lançamento faltando
	 * ou valor errado no mês passado.
	 */
	reconcilesWithPreviousTotal: boolean;
};

/**
 * Como a fatura anterior foi paga, deduzido dos números do próprio arquivo.
 *
 * Todo arquivo de fatura carrega essa informação: as linhas de pagamento
 * recebido são a quitação da fatura passada, e a linha "valor pendente do mês
 * anterior" é o que dela sobrou.
 *
 * O arquivo não diz a qual fatura cada pagamento foi aplicado — e deduzir por
 * data de vencimento erra, porque um mês pode ter o pagamento do vencimento e
 * uma amortização posterior, tratados de formas diferentes pelo banco. Mas ele
 * diz quanto NÃO foi pago, e é daí que sai a conta:
 *
 * - **Com carrego:** pago = total anterior − carrego. O resto dos pagamentos
 *   amortiza a fatura atual.
 * - **Sem carrego, com pagamento:** a fatura anterior foi quitada. O que passar
 *   do total dela amortiza a atual.
 * - **Sem carrego e sem pagamento:** o arquivo não afirma nada. Status `null`.
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

	const base = {
		previousTotal,
		carriedOver,
		filePaymentsTotal,
	};

	if (carriedOver > 0.01) {
		const paidOnPrevious = roundMoney(
			Math.min(previousTotal, Math.max(0, previousTotal - carriedOver)),
		);

		return {
			...base,
			paidOnPrevious,
			paymentStatus:
				paidOnPrevious > 0.01
					? INVOICE_PAYMENT_STATUS.PARTIAL
					: INVOICE_PAYMENT_STATUS.PENDING,
			amortizationOnCurrent: roundMoney(
				Math.max(0, filePaymentsTotal - paidOnPrevious),
			),
			// O pago vem do próprio total menos o carrego: fecha por construção.
			reconcilesWithPreviousTotal: true,
		};
	}

	if (filePaymentsTotal > 0.01) {
		return {
			...base,
			paidOnPrevious: roundMoney(Math.min(previousTotal, filePaymentsTotal)),
			paymentStatus: INVOICE_PAYMENT_STATUS.PAID,
			amortizationOnCurrent: roundMoney(
				Math.max(0, filePaymentsTotal - previousTotal),
			),
			reconcilesWithPreviousTotal:
				Math.abs(filePaymentsTotal - previousTotal) <= 0.02,
		};
	}

	return {
		...base,
		paidOnPrevious: 0,
		paymentStatus: null,
		amortizationOnCurrent: 0,
		reconcilesWithPreviousTotal: true,
	};
}
