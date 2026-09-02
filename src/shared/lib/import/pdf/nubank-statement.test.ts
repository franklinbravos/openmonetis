import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { extractPdfText } from "../pdf-parser";
import {
	isNubankBankStatementPdf,
	parseNubankBankStatementPdf,
	parseNubankStatementBalances,
	parseNubankStatementMovements,
} from "./nubank-statement";

/*
 * Recorte do extrato real de janeiro/2026, no formato que `extractPdfText`
 * produz: itens de texto colados com espaço, uma página por linha.
 *
 * Reproduz as três coisas que definem o documento: o bloco de saldos com
 * rótulos primeiro e valores depois, o agrupamento por dia e direção com
 * subtotal declarado, e o rodapé que se repete no meio das movimentações.
 */
const EXTRATO = `Franklin Diogo Aparecido Bravos Querino dos Santos •••.532.298-••   0001 CPF   Agência   Conta 472152010-3 a 01 DE JANEIRO DE 2026   31 DE JANEIRO DE 2026   VALORES EM R$ Saldo final do período R$ 274,79 Saldo inicial Rendimento líquido Total de entradas Total de saídas Saldo final do período 241,06 +0,00 +1.129,43 -153,54 1.216,95 Movimentações  02 JAN 2026   Total de entradas   + 1.129,43  Transferência recebida pelo Pix   MIX SAUDE SERVICOS MEDICOS LTDA - 39.850.162 /0001-54 - ASAAS IP S.A. (0461) Agência: 1 Conta: 4417672-5 564,70 Transferência recebida pelo Pix   MIX SAUDE SERVICOS MEDICOS LTDA - 39.850.162 /0001-54 - ASAAS IP S.A. (0461) Agência: 1 Conta: 4417672-5 564,73  Tem alguma dúvida? Mande uma mensagem para nosso time de atendimento pelo chat do app ou ligue 4020 0185 (capitais e regiões metropolitanas) ou 0800 591 2117 (demais localidades). Atendimento 24h. Caso a solução fornecida nos canais de atendimento não tenha sido satisfatória, fale com a Ouvidoria em 0800 887 0463 ou pelos meios disponíveis em nubank.com.br/contatos#ouvidoria . Atendimento das 8h às 18h em dias úteis. Extrato gerado dia 26 de agosto de 2026 às 20:36   1 de 5
08 JAN 2026   Total de saídas   - 153,54  Transferência enviada pelo Pix   LUANA SOMERA DE ARAUJO - •••.024.228-•• - BCO DO BRASIL S.A. (0001) Agência: 4331 Conta: 24187-3 75,00 Transferência enviada pelo Pix por aproximação 78,54 `;

describe("isNubankBankStatementPdf", () => {
	it("reconhece o extrato", () => {
		expect(isNubankBankStatementPdf(EXTRATO)).toBe(true);
	});

	it("não confunde com fatura de cartão", () => {
		const fatura =
			"Nubank FATURA 12 JUL 2026 RESUMO DA FATURA ATUAL Total a pagar R$ 10,00 TRANSAÇÕES";
		expect(isNubankBankStatementPdf(fatura)).toBe(false);
	});
});

describe("parseNubankBankStatementPdf", () => {
	it("lê conta, período e não marca como cartão", () => {
		const statement = parseNubankBankStatementPdf(EXTRATO);

		expect(statement.source).toBe("Nubank");
		expect(statement.accountNumber).toBe("472152010-3");
		expect(statement.isCreditCard).toBe(false);
		expect(statement.period).toEqual({ from: "2026-01-01", to: "2026-01-31" });
		expect(statement.accountBalances).toMatchObject({
			openingBalance: 241.06,
			closingBalance: 1216.95,
			balances: true,
		});
	});

	it("o sinal vem do grupo, não do valor", () => {
		// O extrato não imprime sinal por lançamento: quem manda é o
		// "Total de entradas" / "Total de saídas" que abre o grupo.
		const { transactions } = parseNubankStatementMovements(EXTRATO);

		expect(transactions).toHaveLength(4);
		expect(transactions.map((t) => t.transactionType)).toEqual([
			"income",
			"income",
			"expense",
			"expense",
		]);
		expect(transactions.map((t) => t.amount)).toEqual([
			564.7, 564.73, 75, 78.54,
		]);
	});

	it("a data do grupo vale para os lançamentos dele", () => {
		const { transactions } = parseNubankStatementMovements(EXTRATO);

		expect(transactions.map((t) => t.date)).toEqual([
			"2026-01-02",
			"2026-01-02",
			"2026-01-08",
			"2026-01-08",
		]);
	});

	it("a descrição sobrevive ao CNPJ e à agência, que têm ponto e hífen", () => {
		const { transactions } = parseNubankStatementMovements(EXTRATO);

		expect(transactions[0].description).toContain(
			"Transferência recebida pelo Pix",
		);
		expect(transactions[0].description).toContain("MIX SAUDE");
		expect(transactions[0].description).toContain("39.850.162");
		// O rodapé não pode virar descrição.
		expect(transactions[2].description).not.toContain("Tem alguma dúvida");
	});

	it("descarta o cabeçalho de página, que grudava na descrição seguinte", () => {
		// Nome do titular + CPF + agência + conta abrem cada página, no meio das
		// movimentações. Sem removê-los, viravam prefixo do lançamento seguinte.
		const comCabecalho = `${EXTRATO}
Franklin Diogo Aparecido Bravos Querino dos Santos •••.532.298-••   0001 CPF   Agência   Conta 472152010-3 09 JAN 2026   Total de entradas   + 52,45  Transferência Recebida Maria Luiza 52,45 `;
		const { transactions } = parseNubankStatementMovements(comCabecalho);
		const ultima = transactions.at(-1);

		expect(ultima?.description).toBe("Transferência Recebida Maria Luiza");
		expect(ultima?.description).not.toContain("Franklin Diogo");
		expect(ultima?.description).not.toContain("472152010-3");
	});

	it("descarta o rodapé repetido a cada página", () => {
		const { transactions } = parseNubankStatementMovements(EXTRATO);

		for (const transaction of transactions) {
			expect(transaction.description).not.toMatch(/Extrato gerado|Ouvidoria/i);
			expect(transaction.description).not.toMatch(/4020 0185|0800/);
		}
	});

	it("cada grupo do dia fecha com o subtotal declarado", () => {
		const { groups } = parseNubankStatementMovements(EXTRATO);

		expect(groups).toHaveLength(2);
		expect(groups[0]).toMatchObject({
			date: "2026-01-02",
			direction: "in",
			declared: 1129.43,
			parsed: 1129.43,
			balances: true,
		});
		expect(groups[1]).toMatchObject({
			date: "2026-01-08",
			direction: "out",
			declared: 153.54,
			parsed: 153.54,
			balances: true,
		});
	});

	it("dá identidade à linha, para reimportação não duplicar", () => {
		const { transactions } = parseNubankStatementMovements(EXTRATO);

		for (const transaction of transactions) {
			expect(transaction.externalId).toBeTruthy();
		}
		// Duas transferências no mesmo dia com valores diferentes: ids distintos.
		expect(transactions[0].externalId).not.toBe(transactions[1].externalId);
		// E o mesmo texto gera sempre o mesmo id.
		expect(
			parseNubankStatementMovements(EXTRATO).transactions[0].externalId,
		).toBe(transactions[0].externalId);
	});

	it("recusa arquivo sem movimentação em vez de importar vazio", () => {
		expect(() => parseNubankBankStatementPdf("Nubank Movimentações")).toThrow(
			/Nenhuma transação/i,
		);
	});
});

describe("parseNubankStatementBalances", () => {
	it("o bloco de saldos fecha", () => {
		// 241,06 + 0,00 + 1.129,43 − 153,54 = 1.216,95
		const balances = parseNubankStatementBalances(EXTRATO);

		expect(balances).toMatchObject({
			openingBalance: 241.06,
			yield: 0,
			totalIn: 1129.43,
			totalOut: 153.54,
			closingBalance: 1216.95,
			residual: 0,
			balances: true,
		});
	});

	it("acusa quando não fecha", () => {
		const adulterado = EXTRATO.replace("1.216,95", "1.316,95");
		const balances = parseNubankStatementBalances(adulterado);

		expect(balances?.balances).toBe(false);
		expect(balances?.residual).toBe(-100);
	});

	it("sem o bloco, devolve null", () => {
		expect(parseNubankStatementBalances("Nubank sem saldos")).toBeNull();
	});
});

describe("extrato Nubank agosto/2026 (amostra local)", () => {
	it("lê 67 lançamentos e saldos do PDF real", async () => {
		const samplePath =
			"/Users/franklinbravos/Documents/Extratos e Faturas/NU_4721520103_01AGO2026_31AGO2026.pdf";
		if (!existsSync(samplePath)) return;

		const text = await extractPdfText(readFileSync(samplePath).buffer);
		const statement = parseNubankBankStatementPdf(text);
		const { groups } = parseNubankStatementMovements(text);

		expect(statement.transactions).toHaveLength(67);
		expect(groups.every((group) => group.balances)).toBe(true);
		expect(statement.accountBalances).toMatchObject({
			openingBalance: 1272.08,
			closingBalance: 65.96,
			balances: true,
		});
	});
});
