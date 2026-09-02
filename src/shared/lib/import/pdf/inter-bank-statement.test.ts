import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "../pdf-parser";
import {
	isInterBankStatementPdf,
	parseInterBankStatementBalances,
	parseInterBankStatementMovements,
	parseInterBankStatementPdf,
} from "./inter-bank-statement";

/**
 * Recorte do extrato real de agosto/2026, no formato que `extractPdfText`
 * produz: rodapé no meio das movimentações e saldo corrido por linha.
 */
const EXTRATO = `Solicitado em: 01/09/2026 - 20h50 FRANKLIN DIOGO APARECIDO BRAVOS QUE CPF/CNPJ: 46.268.915/0001-83, Instituição: Banco Inter, Agência: 0001-9, Conta: 40042891-1 Período: 01/08/2026 a 31/08/2026 Saldo total R$ 6.667,81 (bloqueado + disponível) Saldo disponível: R$ 6.667,81 Saldo bloqueado: R$ 0,00 Valor Saldo por transação 1 de Agosto de 2026 Saldo do dia: R$ 987,81 Pix enviado: "Cp :18236120-54480879 Claudia Santos de Souza" -R$ 10,00 R$ 1.007,81 Pix enviado: "Cp :18236120-54480879 CLAUDIA SANTOS DE SOUZA" -R$ 20,00 R$ 987,81 3 de Agosto de 2026 Saldo do dia: R$ 6.667,81 Pix enviado: "00019 465712240 JOSE NETO" -R$ 400,00 R$ 587,81 Pix enviado: "Cp :00000000-CONTABILIZEI TECNOLOGIA LTDA" -R$ 200,35 R$ 387,46 Pix enviado: "Cp :60701190-RECEITA FEDERAL" -R$ 1.719,65 -R$ 1.332,19 Fale com a gente SAC: 0800 940 9999 (opção 09) Ouvidoria: 0800 940 7772 Deficiência de fala e audição: 0800 979 7099 Pix recebido: "Cp :70431630-Tabapora Empreendimentos Imobiliarios Ltda" R$ 8.000,00 R$ 6.667,81`;

describe("isInterBankStatementPdf", () => {
	it("reconhece extrato de conta", () => {
		expect(isInterBankStatementPdf(EXTRATO)).toBe(true);
	});

	it("não confunde com fatura de cartão", () => {
		expect(
			isInterBankStatementPdf(
				"Resumo da fatura DESPESAS DO MÊS Período: 01/08/2026",
			),
		).toBe(false);
	});
});

describe("parseInterBankStatementMovements", () => {
	it("continua lendo depois do rodapé repetido", () => {
		const { transactions } = parseInterBankStatementMovements(EXTRATO);

		expect(transactions).toHaveLength(6);
		expect(transactions.at(-1)?.description).toContain("Tabapora");
	});

	it("captura saldo corrido de cada linha", () => {
		const { transactions } = parseInterBankStatementMovements(EXTRATO);

		expect(transactions[0]).toMatchObject({
			amount: 10,
			runningBalance: 1007.81,
			signedAmount: -10,
		});
	});
});

describe("parseInterBankStatementBalances", () => {
	it("deriva abertura e fechamento a partir do saldo corrido", () => {
		const { transactions } = parseInterBankStatementMovements(EXTRATO);
		const balances = parseInterBankStatementBalances(EXTRATO, transactions, {
			from: "2026-08-01",
			to: "2026-08-31",
		});

		expect(balances).toMatchObject({
			openingBalance: 1017.81,
			closingBalance: 6667.81,
			balances: true,
		});
	});
});

describe("parseInterBankStatementPdf", () => {
	it("lê conta, período, lançamentos e saldos", () => {
		const statement = parseInterBankStatementPdf(EXTRATO);

		expect(statement.source).toBe("Banco Inter");
		expect(statement.accountNumber).toBe("400428911");
		expect(statement.isCreditCard).toBe(false);
		expect(statement.period).toEqual({ from: "2026-08-01", to: "2026-08-31" });
		expect(statement.transactions).toHaveLength(6);
		expect(statement.accountBalances).toMatchObject({
			openingBalance: 1017.81,
			closingBalance: 6667.81,
			balances: true,
		});
	});
});

describe("extrato Inter agosto/2026 (amostra local)", () => {
	it("lê 31 lançamentos e saldos do PDF real", async () => {
		const samplePath =
			"/Users/franklinbravos/Documents/Extratos e Faturas/Extrato-01-08-2026-a-31-08-2026-PDF.pdf";
		if (!existsSync(samplePath)) return;

		const text = await extractPdfText(readFileSync(samplePath).buffer);
		const statement = parseInterBankStatementPdf(text);

		expect(statement.transactions).toHaveLength(31);
		expect(statement.accountBalances).toMatchObject({
			openingBalance: 1017.81,
			closingBalance: 0.82,
			balances: true,
		});
	});
});
