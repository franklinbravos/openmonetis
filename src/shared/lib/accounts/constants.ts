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
 * `AUTO_FATURA:<cartão>:<período>`, seguido do que mais a nota carregar.
 *
 * A nota não termina no período: a importação anexa uma linha `Extrato: <nome
 * original>`, e a amortização anexa `:AMORT:<data>`. Ler por `split(":")` fazia
 * o período de uma nota multilinha sair como `"2026-01\nExtrato"` e ser
 * descartado — o pagamento existia e nenhuma fatura o via.
 */
const INVOICE_PAYMENT_NOTE_PATTERN = /^AUTO_FATURA:([^:\s]+):(\d{4}-\d{2})/;

/**
 * Período da fatura que a nota de pagamento aponta.
 *
 * É a nota, e não a coluna `periodo` do lançamento, que diz a qual fatura o
 * pagamento pertence: a amortização fica no período em que o dinheiro saiu, que
 * é o mês anterior ao da fatura que ela abateu.
 */
export const parseInvoicePaymentNotePeriod = (
	note: string | null | undefined,
): string | null => note?.match(INVOICE_PAYMENT_NOTE_PATTERN)?.[2] ?? null;

/**
 * Cartão da fatura que a nota de pagamento aponta.
 *
 * Mesma razão do período: quem sabe a qual fatura o pagamento pertence é a
 * nota. A coluna `cartao_id` do pagamento é nula — ele sai da conta corrente.
 */
export const parseInvoicePaymentNoteCardId = (
	note: string | null | undefined,
): string | null => note?.match(INVOICE_PAYMENT_NOTE_PATTERN)?.[1] ?? null;

export const INVOICE_ADJUSTMENT_NAME = "Ajuste de fatura";

export const ACCOUNT_BALANCE_ADJUSTMENT_NAME = "Ajuste de saldo";

/**
 * O ajuste de saldo é andaime, não movimento — não entra em relatório.
 *
 * Ele existe para impor a abertura que o extrato declara enquanto os meses
 * anteriores não foram importados, e some quando eles entram. Contá-lo como
 * receita ou despesa inventa dinheiro: na conta Nubank, importar agosto sem os
 * meses de trás produz um ajuste de R$ 39.905,96 que nunca entrou na conta.
 *
 * Casa pelo nome, e não por anotação, para valer também nos ajustes que já
 * estavam gravados.
 */
export const isAccountBalanceAdjustmentName = (
	name: string | null | undefined,
): boolean =>
	name?.trim().toLowerCase() === ACCOUNT_BALANCE_ADJUSTMENT_NAME.toLowerCase();

export const REFUND_NOTE_PREFIX = "AUTO_REEMBOLSO:";

export const buildRefundNote = (originalTransactionId: string) =>
	`${REFUND_NOTE_PREFIX}${originalTransactionId}`;

export const isRefundNote = (note: string | null | undefined) =>
	note?.startsWith(REFUND_NOTE_PREFIX) ?? false;

export const isAccountInactive = (status: string | null | undefined) =>
	status?.toLowerCase() === "inativa";
