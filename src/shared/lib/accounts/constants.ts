import {
	PAYMENT_METHODS,
	TRANSACTION_CONDITIONS,
	TRANSACTION_TYPES,
} from "@/features/transactions/lib/constants";

export const INITIAL_BALANCE_CATEGORY_NAME = "Saldo inicial";
export const INITIAL_BALANCE_NOTE = "saldo inicial";

export const INITIAL_BALANCE_CONDITION =
	TRANSACTION_CONDITIONS.find((condition) => condition === "À vista") ??
	"À vista";
export const INITIAL_BALANCE_PAYMENT_METHOD =
	PAYMENT_METHODS.find((method) => method === "Pix") ?? "Pix";
export const INITIAL_BALANCE_TRANSACTION_TYPE =
	TRANSACTION_TYPES.find((type) => type === "Receita") ?? "Receita";

export const ACCOUNT_AUTO_INVOICE_NOTE_PREFIX = "AUTO_FATURA:";

export const buildInvoicePaymentNote = (cardId: string, period: string) =>
	`${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}${cardId}:${period}`;

/**
 * Marca da amortização: pagamento que abateu esta fatura antes do vencimento.
 *
 * Quem paga em vários dias para reduzir juros abate a fatura seguinte antes de
 * ela fechar — o arquivo do mês seguinte declara esse pagamento. Ele precisa de
 * nota própria porque o pagamento principal, criado pela baixa da fatura, é
 * localizado por nota exata: com a mesma nota, a baixa sobrescreveria a
 * amortização e o dinheiro desapareceria do extrato.
 */
export const INVOICE_AMORTIZATION_NOTE_MARKER = ":AMORT:";

export const buildInvoiceAmortizationNote = (
	cardId: string,
	period: string,
	paymentDate: string,
) =>
	`${buildInvoicePaymentNote(cardId, period)}${INVOICE_AMORTIZATION_NOTE_MARKER}${paymentDate}`;

export const isInvoiceAmortizationNote = (note: string | null | undefined) =>
	note?.includes(INVOICE_AMORTIZATION_NOTE_MARKER) ?? false;

/**
 * Período da fatura que a nota de pagamento aponta.
 *
 * É a nota, e não a coluna `periodo` do lançamento, que diz a qual fatura o
 * pagamento pertence: a amortização fica no período em que o dinheiro saiu, que
 * é o mês anterior ao da fatura que ela abateu.
 */
export const parseInvoicePaymentNotePeriod = (
	note: string | null | undefined,
): string | null => {
	if (!note?.startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX)) return null;
	// `AUTO_FATURA:<cartão>:<período>` — o id do cartão é um uuid, sem `:`.
	const period = note.split(":")[2];
	return period && /^\d{4}-\d{2}$/.test(period) ? period : null;
};

export const INVOICE_ADJUSTMENT_NAME = "Ajuste de fatura";

export const ACCOUNT_BALANCE_ADJUSTMENT_NAME = "Ajuste de saldo";

export const REFUND_NOTE_PREFIX = "AUTO_REEMBOLSO:";

export const buildRefundNote = (originalTransactionId: string) =>
	`${REFUND_NOTE_PREFIX}${originalTransactionId}`;

export const isRefundNote = (note: string | null | undefined) =>
	note?.startsWith(REFUND_NOTE_PREFIX) ?? false;

export const isAccountInactive = (status: string | null | undefined) =>
	status?.toLowerCase() === "inativa";
