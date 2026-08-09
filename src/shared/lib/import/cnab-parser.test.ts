import { describe, expect, it } from "vitest";
import { parseCnab } from "./cnab-parser";

// Linha segmento E: "07700013" + 5 chars + "E" + "S" + segmento.
// Segmento: data(8) + filler(8) + centavos(18) + CD(1) + filler(7) + descricao(25) + externalId
const expenseLine =
	"0770001300000E" +
	"S" +
	"15012024" +
	"        " +
	"000000000000005000" +
	"D" +
	"       " +
	"COMPRA MERCADO           " +
	"ext-123";

const incomeLine =
	"0770001300000E" +
	"S" +
	"20012024" +
	"        " +
	"000000000000120050" +
	"C" +
	"       " +
	"SALARIO                 " +
	"ext-456";

describe("parseCnab", () => {
	it("extrai número da conta do header", () => {
		const header = "077000000000000000190000000123456";
		const result = parseCnab(`${header}\n${expenseLine}\n`);
		expect(result.accountNumber).toBe("000123456");
	});

	it("parseia despesa do segmento E", () => {
		const result = parseCnab(expenseLine);
		const expense = result.transactions[0];
		expect(expense?.date).toBe("2024-01-15");
		expect(expense?.amount).toBe(50);
		expect(expense?.transactionType).toBe("expense");
		expect(expense?.description).toBe("COMPRA MERCADO");
		expect(expense?.externalId).toBe("ext-123");
	});

	it("parseia receita com CD C", () => {
		const result = parseCnab(`${expenseLine}\n${incomeLine}\n`);
		const income = result.transactions[1];
		expect(income?.transactionType).toBe("income");
		expect(income?.amount).toBe(1200.5);
	});

	it("fonte é Banco Inter e não é cartão", () => {
		const result = parseCnab(expenseLine);
		expect(result.source).toBe("Banco Inter");
		expect(result.isCreditCard).toBe(false);
	});

	it("lança erro para conteúdo não CNAB", () => {
		expect(() => parseCnab("qualquer coisa")).toThrow(
			"Formato CNAB não reconhecido",
		);
	});

	it("lança erro quando não há transações", () => {
		const noTransactions = "0770001300000E" + "S" + "15012024";
		expect(() => parseCnab(noTransactions)).toThrow(
			"Nenhuma transação encontrada no arquivo CNAB",
		);
	});
});
