import { describe, expect, it } from "vitest";
import {
	isInvoicePaymentDescription,
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
