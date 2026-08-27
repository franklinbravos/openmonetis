import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInterCardInvoiceTotal } from "./pdf/inter-card-invoice";
import { resolvePdfTotalMetadata } from "./pdf/invoice-metadata";
import { parsePdf, parsePdfText } from "./pdf-parser";

/** Texto extraído pelo pdf.js (linhas concatenadas), espelhando fatura Inter real. */
const INTER_CARD_JUL_2026_FIXTURE = `
Resumo da fatura
Total da sua fatura  R$   78,00  Este é o valor que você precisa pagar nesse mês  Limite de crédito total  R$   468,00  Data de Vencimento  10/07/2026
DESPESAS DO MÊS  R$   78,00  FATURA ATUAL  R$   78,00
Despesas da fatura
CARTÃO 5497****7095
10 de jun. 2026 PAGTO DEBITO AUTOMATICO  -  + R$   78,00
Total CARTÃO 5497****7095  R$   0,00
CARTÃO 5497****1853
13 de jan. 2026 LIFE BY VIVARA (Parcela 06 de 10)  -  R$   78,00
Total CARTÃO 5497****1853  R$   78,00
Limite de crédito total:  R$   468,00
Próxima fatura
LIFE BY VIVARA (Parcela 07 de 10)  R$   78,00
Saldo em aberto total  R$   312,00
`;

describe("parseInterCardPdf", () => {
	it("extrai total da fatura (não limite de crédito) e lançamentos", () => {
		const result = parsePdfText(INTER_CARD_JUL_2026_FIXTURE);

		expect(result.source).toBe("Banco Inter");
		expect(result.isCreditCard).toBe(true);
		expect(result.transactions).toHaveLength(1);
		expect(result.transactions[0]).toMatchObject({
			date: "2026-01-13",
			description: "LIFE BY VIVARA (Parcela 06 de 10)",
			amount: 78,
		});
		expect(result.invoice?.totalAmount).toBe(78);
		expect(result.invoice?.totalAmountSource).toBe("pdf_header");
		expect(result.invoice?.dueDate).toBe("2026-07-10");
		expect(result.invoice?.period).toBe("2026-07");
	});

	it("parseInterCardInvoiceTotal ignora limite de crédito total", () => {
		expect(parseInterCardInvoiceTotal(INTER_CARD_JUL_2026_FIXTURE)).toBe(78);
	});

	it("resolvePdfTotalMetadata corrige cabeçalho incoerente com as linhas", () => {
		expect(resolvePdfTotalMetadata(468, 78)).toEqual({
			totalAmount: 78,
			totalAmountSource: "pdf_lines_fallback",
		});
	});

	it("importa PDF de amostra local quando disponível", async () => {
		const samplePath =
			"/Users/franklinbravos/Downloads/fatura-inter-2026-07.pdf";
		if (!existsSync(samplePath)) return;

		const buffer = readFileSync(samplePath);
		const result = await parsePdf(buffer.buffer);

		expect(result.source).toBe("Banco Inter");
		expect(result.invoice?.totalAmount).toBe(78);
		expect(result.transactions.length).toBeGreaterThan(0);
	});
});
