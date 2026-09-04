import { describe, expect, it } from "vitest";
import {
	guessInvoicePaymentPeriod,
	isInvoicePaymentDescription,
	matchInvoicePaymentByAmount,
	sanitizeExcludedCardInvoicePaymentRow,
	shouldExcludeInvoicePaymentFromCardImport,
} from "./import-invoice-payment";

describe("import-invoice-payment", () => {
	it("reconhece pagamento recebido da fatura Nubank", () => {
		expect(isInvoicePaymentDescription("Pagamento recebido")).toBe(true);
		// Como o extrato do Nubank escreve. Sem isto, o pagamento da fatura entrava
		// no extrato como despesa comum e não liquidava fatura nenhuma.
		expect(isInvoicePaymentDescription("Pagamento de fatura")).toBe(true);
		expect(isInvoicePaymentDescription("Pagamento de fatura Nubank")).toBe(
			true,
		);
	});

	it("reconhece o débito automático da fatura, como o Inter escreve", () => {
		// O extrato do Inter não diz "pagamento de fatura" em nenhum lugar: diz
		// "Pagamento efetuado: Debito Automatico Fatura Cartao Inter".
		expect(
			isInvoicePaymentDescription(
				'Pagamento efetuado: "Debito Automatico Fatura Cartao Inter"',
			),
		).toBe(true);
		expect(
			isInvoicePaymentDescription("Débito Automático Fatura Cartão Inter"),
		).toBe(true);
		// Não é qualquer coisa com "fatura" e "cartão".
		expect(isInvoicePaymentDescription("Anuidade cartão fatura")).toBe(false);
	});

	it("exclui pagamento recebido na importação de fatura de cartão", () => {
		expect(
			shouldExcludeInvoicePaymentFromCardImport({
				description: "Pagamento recebido",
				isCreditCardStatement: true,
			}),
		).toBe(true);
	});

	it("mantém pagamento de fatura no extrato de conta", () => {
		expect(
			shouldExcludeInvoicePaymentFromCardImport({
				description: "Pagamento fatura Nubank",
				isCreditCardStatement: false,
			}),
		).toBe(false);
	});

	it("desmarca e deixa de tratar como pgto. fatura na revisão do cartão", () => {
		expect(
			sanitizeExcludedCardInvoicePaymentRow(
				{
					description: "Pagamento recebido",
					kind: "invoice_payment",
					selected: true,
					invoicePaymentCardId: "card-1",
					invoicePaymentPeriod: "2026-01",
				},
				true,
			),
		).toEqual({
			description: "Pagamento recebido",
			kind: "transaction",
			selected: false,
			invoicePaymentCardId: null,
			invoicePaymentPeriod: null,
		});
	});
});

describe("pagamento de fatura: o que NÃO é", () => {
	it("não casa com estorno nem com menção no meio da frase", () => {
		expect(isInvoicePaymentDescription("Estorno de pagamento de fatura")).toBe(
			false,
		);
		expect(
			isInvoicePaymentDescription("Débito referente a pagamento de fatura"),
		).toBe(false);
		expect(isInvoicePaymentDescription("Pagamento de boleto efetuado")).toBe(
			false,
		);
	});
});

describe("guessInvoicePaymentPeriod", () => {
	const cardOptions = [
		{
			value: "nubank",
			label: "Nubank",
			closingDay: "5",
			dueDay: "15",
		},
		{
			value: "nubank-fim-mes",
			label: "Nubank fim do mês",
			closingDay: "22",
			dueDay: "1",
		},
	];

	it("pagamento em 10/08 sugere fatura de agosto, não de setembro", () => {
		expect(guessInvoicePaymentPeriod("2026-08-10", cardOptions, "nubank")).toBe(
			"2026-08",
		);
	});

	it("pagamento após fechamento com vencimento no mês seguinte", () => {
		expect(
			guessInvoicePaymentPeriod("2026-03-25", cardOptions, "nubank-fim-mes"),
		).toBe("2026-04");
	});

	it("sem cartão identificado, devolve null", () => {
		expect(
			guessInvoicePaymentPeriod("2026-08-10", cardOptions, null),
		).toBeNull();
	});
});

describe("matchInvoicePaymentByAmount", () => {
	const NUBANK = "cartao-nubank";
	const INTER = "cartao-inter";

	it("acha a fatura pelo valor quando a descrição não diz nada", () => {
		// Caso real: "Pagamento de fatura" de R$ 6.003,17 em 12/01, que é
		// exatamente o total da fatura Nubank de janeiro.
		expect(
			matchInvoicePaymentByAmount({
				amount: 6003.17,
				paymentDate: "2026-01-12",
				candidates: [
					{
						cardId: NUBANK,
						period: "2026-01",
						total: 6003.17,
						dueDate: "2026-01-12",
					},
					{
						cardId: NUBANK,
						period: "2026-02",
						total: 7301.59,
						dueDate: "2026-02-12",
					},
					{
						cardId: INTER,
						period: "2026-01",
						total: 360.57,
						dueDate: "2026-01-10",
					},
				],
			}),
		).toEqual({ cardId: NUBANK, period: "2026-01" });
	});

	it("absorve o centavo de arredondamento do banco", () => {
		expect(
			matchInvoicePaymentByAmount({
				amount: 6003.18,
				paymentDate: "2026-01-12",
				candidates: [
					{
						cardId: NUBANK,
						period: "2026-01",
						total: 6003.17,
						dueDate: "2026-01-12",
					},
				],
			}),
		).toEqual({ cardId: NUBANK, period: "2026-01" });
	});

	it("não chuta entre cartões diferentes com o mesmo valor", () => {
		// Vínculo errado liquida a fatura errada. Melhor perguntar.
		expect(
			matchInvoicePaymentByAmount({
				amount: 500,
				paymentDate: "2026-01-12",
				candidates: [
					{
						cardId: NUBANK,
						period: "2026-01",
						total: 500,
						dueDate: "2026-01-12",
					},
					{
						cardId: INTER,
						period: "2026-01",
						total: 500,
						dueDate: "2026-01-10",
					},
				],
			}),
		).toBeNull();
	});

	it("empate no mesmo cartão vence o vencimento mais próximo", () => {
		expect(
			matchInvoicePaymentByAmount({
				amount: 500,
				paymentDate: "2026-02-12",
				candidates: [
					{
						cardId: NUBANK,
						period: "2026-01",
						total: 500,
						dueDate: "2026-01-12",
					},
					{
						cardId: NUBANK,
						period: "2026-02",
						total: 500,
						dueDate: "2026-02-12",
					},
					{
						cardId: NUBANK,
						period: "2026-03",
						total: 500,
						dueDate: "2026-03-12",
					},
				],
			}),
		).toEqual({ cardId: NUBANK, period: "2026-02" });
	});

	it("pagamento parcial não casa com nada", () => {
		// Metade da fatura não é a fatura; aí o usuário escolhe.
		expect(
			matchInvoicePaymentByAmount({
				amount: 3000,
				paymentDate: "2026-01-12",
				candidates: [
					{
						cardId: NUBANK,
						period: "2026-01",
						total: 6003.17,
						dueDate: "2026-01-12",
					},
				],
			}),
		).toBeNull();
	});

	it("sem candidatos, devolve null", () => {
		expect(
			matchInvoicePaymentByAmount({
				amount: 100,
				paymentDate: "2026-01-12",
				candidates: [],
			}),
		).toBeNull();
	});
});
