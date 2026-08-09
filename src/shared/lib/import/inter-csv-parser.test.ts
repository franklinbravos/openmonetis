import { describe, expect, it } from "vitest";
import { parseInterCsv } from "./inter-csv-parser";

const validInterCsv = `Conta;000123456;;
Período;01/01/2026 a 31/01/2026;
Data Lançamento;Histórico;Descrição;Valor
02/01/2026;COMPRA;MERCADO SA;-50,00
05/01/2026;TRANSFERENCIA;RECEBIDA;1200,50
10/01/2026;PIX;ENVIADO;-25,10
`;

describe("parseInterCsv", () => {
	it("extrai número da conta", () => {
		const result = parseInterCsv(validInterCsv);
		expect(result.accountNumber).toBe("000123456");
	});

	it("extrai período declarado", () => {
		const result = parseInterCsv(validInterCsv);
		expect(result.period).toEqual({ from: "2026-01-01", to: "2026-01-31" });
	});

	it("converte datas de lançamento", () => {
		const result = parseInterCsv(validInterCsv);
		expect(result.transactions[0]?.date).toBe("2026-01-02");
	});

	it("despesa negativa vira expense", () => {
		const result = parseInterCsv(validInterCsv);
		expect(result.transactions[0]?.transactionType).toBe("expense");
		expect(result.transactions[0]?.amount).toBe(50);
	});

	it("receita positiva vira income", () => {
		const result = parseInterCsv(validInterCsv);
		expect(result.transactions[1]?.transactionType).toBe("income");
		expect(result.transactions[1]?.amount).toBe(1200.5);
	});

	it("combina histórico e descrição quando ambos existem", () => {
		const result = parseInterCsv(validInterCsv);
		expect(result.transactions[0]?.description).toBe("COMPRA: MERCADO SA");
	});

	it("gera externalId sintético estável", () => {
		const result = parseInterCsv(validInterCsv);
		expect(result.transactions[0]?.externalId).toBe(
			"2026-01-02|50|compra: mercado sa",
		);
	});

	it("fonte é Banco Inter", () => {
		const result = parseInterCsv(validInterCsv);
		expect(result.source).toBe("Banco Inter");
		expect(result.isCreditCard).toBe(false);
	});

	it("lança erro para CSV não reconhecido", () => {
		expect(() => parseInterCsv("coluna1;coluna2\n1;2")).toThrow(
			"Formato CSV não reconhecido",
		);
	});

	it("lança erro quando não há transações", () => {
		const headerOnly =
			"Conta;123;;\nData Lançamento;Histórico;Descrição;Valor\n";
		expect(() => parseInterCsv(headerOnly)).toThrow(
			"Nenhuma transação encontrada no CSV",
		);
	});
});
