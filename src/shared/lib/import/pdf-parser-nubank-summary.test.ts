import { describe, expect, it } from "vitest";
import { parsePdfText } from "./pdf-parser";

/**
 * Layout do bloco "Resumo da fatura atual" de uma fatura Nubank, com os valores
 * reais da fatura de maio/2026. O pagamento recebido vem com menos Unicode
 * (−, U+2212), como o PDF renderiza.
 */
const NUBANK_SUMMARY = `
Nubank
Data de vencimento: 12 MAI 2026

RESUMO DA FATURA ATUAL
Fatura anterior R$ 10.430,51
Pagamento recebido −R$ 10.430,51
Total de compras de todos os cartões, 05 ABR a 05 MAI R$ 6.357,49
Outros lançamentos R$ 167,75
Total a pagar R$ 6.525,24
Pagamento mínimo para não ficar em atraso R$ 978,78

TRANSAÇÕES DE 05 ABR a 05 MAI
05 ABR Boa Supermercados R$ 183,35

Pagamentos e Financiamentos
Pagamentos -R$ 10.430,51
13 ABR Pagamento em 13 ABR −R$ 10.430,51
`;

describe("resumo da fatura Nubank", () => {
	it("extrai a fatura anterior e o pagamento recebido", () => {
		const result = parsePdfText(NUBANK_SUMMARY);

		expect(result.invoice?.previousInvoiceTotal).toBe(10430.51);
		expect(result.invoice?.previousInvoicePaymentReceived).toBe(10430.51);
	});

	it("mantém o total a pagar da própria fatura", () => {
		const result = parsePdfText(NUBANK_SUMMARY);

		expect(result.invoice?.totalAmount).toBe(6525.24);
	});

	it("aceita menos ASCII no pagamento recebido", () => {
		const result = parsePdfText(
			NUBANK_SUMMARY.replace(
				"Pagamento recebido −R$",
				"Pagamento recebido -R$",
			),
		);

		expect(result.invoice?.previousInvoicePaymentReceived).toBe(10430.51);
	});

	it("não confunde pagamento parcial com quitação", () => {
		const result = parsePdfText(
			NUBANK_SUMMARY.replace(
				"Pagamento recebido −R$ 10.430,51",
				"Pagamento recebido −R$ 1.000,00",
			),
		);

		expect(result.invoice?.previousInvoiceTotal).toBe(10430.51);
		expect(result.invoice?.previousInvoicePaymentReceived).toBe(1000);
	});

	it("volta nulo quando o arquivo não traz o resumo", () => {
		const result = parsePdfText(
			NUBANK_SUMMARY.replace(/Fatura anterior.*\n/, "").replace(
				/Pagamento recebido.*\n/,
				"",
			),
		);

		expect(result.invoice?.previousInvoiceTotal ?? null).toBeNull();
		expect(result.invoice?.previousInvoicePaymentReceived ?? null).toBeNull();
	});
});

describe("data do pagamento na seção final", () => {
	it("extrai a data quando a seção se chama só Pagamentos", () => {
		// O PDF real traz "Pagamentos", não "Pagamentos e Financiamentos". Buscar
		// só o título longo deixava a data de fora, e o slice(-1) do índice -1
		// cortava o texto no último caractere em vez de falhar.
		const result = parsePdfText(NUBANK_SUMMARY);

		expect(result.invoice?.paymentDate).toBe("2026-04-13");
	});

	it("também aceita o título longo", () => {
		const result = parsePdfText(
			NUBANK_SUMMARY.replace(
				"Pagamentos e Financiamentos",
				"Pagamentos e Financiamentos",
			),
		);

		expect(result.invoice?.paymentDate).toBe("2026-04-13");
	});

	it("sem seção de pagamento, a data fica nula", () => {
		const result = parsePdfText(
			NUBANK_SUMMARY.replace(/Pagamentos[\s\S]*$/, ""),
		);

		expect(result.invoice?.paymentDate ?? null).toBeNull();
	});
});
