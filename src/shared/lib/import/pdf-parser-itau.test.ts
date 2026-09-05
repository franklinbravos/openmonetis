import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf, parsePdfText } from "./pdf-parser";

const ITAU_SAMPLE_FIXTURE = `
Itaú cartão final 1234
SAMSUNG ITAUCARD
Vencimento 09/08/2026
Total desta fatura R$ 1.234,56

Lançamentos: compras e saques
FRANKLIN (1234)
DATA ESTABELECIMENTO VALOR EM R$
07/07 MERCADO LIVRE*MERCADOL 150,00
08/07 SPOTIFY 21,90
15/07 POSTO IPIRANGA 09/12 320,00
Total dos lançamentos atuais R$ 491,90

Lançamentos: produtos e serviços
FRANKLIN (1234)
22/07 ANUIDADE DIFERENCIADA 12/12 45,00
Total dos lançamentos atuais R$ 45,00

Compras parceladas - próximas faturas
`;

const ITAU_BLOCK_TEXT_FIXTURE = `
Itaú cartão final 5678
Vencimento 10/09/2026
Total desta fatura   812,10

Lançamentos: compras e saques
FRANKLIN (5678)
DATA ESTABELECIMENTO VALOR EM R$
06/08 WEST TOWERSBARUERIBR   42,00 vestuário BARUERI 20/08   MOVIDA RAC CPS 01/03   82,98 serviços CAMPINAS 24/08   MOVIDA RAC CPS 01/03   82,16 serviços CAMPINAS
Total dos lançamentos atuais   737,44

Lançamentos internacionais
Franklin D A B Q Santos
DATA ESTABELECIMENTO   US$   R$
27/08 ANOMALYANOMA.LYUS   57,11 53,68   BRL   10,44
Repasse de IOF em R$   2,00
Total lançamentos inter. em R$   59,11
Total dos lançamentos atuais   796,55
Encargos (Financiamento + moratório)   15,55
`;

describe("parseItauCardPdf", () => {
	it("reconhece fatura Itaú Samsung e extrai lançamentos", () => {
		const result = parsePdfText(ITAU_SAMPLE_FIXTURE);

		expect(result.source).toBe("Itaú");
		expect(result.isCreditCard).toBe(true);
		expect(result.transactions).toHaveLength(4);
		expect(result.transactions[0]).toMatchObject({
			date: "2026-07-07",
			description: "MERCADO LIVRE*MERCADOL",
			amount: 150,
			transactionType: "expense",
		});
		expect(result.transactions[2]?.description).toContain("POSTO IPIRANGA");
		expect(result.invoice?.dueDate).toBe("2026-08-09");
		expect(result.invoice?.period).toBe("2026-08");
	});

	it("extrai parcelas, categorias e lançamentos internacionais em bloco contínuo", () => {
		const result = parsePdfText(ITAU_BLOCK_TEXT_FIXTURE);
		const transactionTotal = result.transactions.reduce(
			(sum, transaction) => sum + transaction.amount,
			0,
		);

		expect(result.transactions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					description: "MOVIDA RAC CPS 01/03",
					amount: 82.98,
				}),
				expect.objectContaining({
					description: "MOVIDA RAC CPS 01/03",
					amount: 82.16,
				}),
				expect.objectContaining({
					description: "ANOMALYANOMA.LYUS",
					amount: 57.11,
				}),
				expect.objectContaining({
					description: "IOF internacional",
					amount: 2,
				}),
				expect.objectContaining({
					description: "Encargos (Financiamento + moratório)",
					amount: 15.55,
				}),
			]),
		);
		expect(transactionTotal).toBeCloseTo(281.8, 2);
		expect(result.invoice?.financeChargesTotal).toBeCloseTo(15.55, 2);
		expect(result.invoice?.dueDate).toBe("2026-09-10");
	});

	it("extrai encargos do resumo Itaú como lançamento separado", () => {
		const fixture = `
Itaú cartão final 5678
Vencimento 10/09/2026
Encargos (Financiamento + moratório)   15,55
Lançamentos atuais   796,55
Total desta fatura   812,10
Lançamentos: compras e saques
06/08 LOJA TESTE   10,00
`;

		const result = parsePdfText(fixture);

		expect(result.transactions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					date: "2026-09-10",
					amount: 15.55,
					description: "Encargos (Financiamento + moratório)",
				}),
			]),
		);
		expect(result.invoice?.financeChargesTotal).toBeCloseTo(15.55, 2);
		expect(result.invoice?.financeChargesLabel).toBe(
			"Encargos (Financiamento + moratório)",
		);
	});

	it("importa PDF de amostra local quando disponível", async () => {
		const samplePath = join(
			process.cwd(),
			"samples/finance/faturas/Fatura_Itau_20260809-130820.pdf",
		);
		if (!existsSync(samplePath)) return;

		const buffer = readFileSync(samplePath);
		const data = new Uint8Array(
			buffer.buffer,
			buffer.byteOffset,
			buffer.byteLength,
		);
		const result = await parsePdf(data.buffer);

		expect(result.source).toBe("Itaú");
		expect(result.isCreditCard).toBe(true);
		expect(result.transactions.length).toBeGreaterThan(0);
		expect(result.invoice?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
