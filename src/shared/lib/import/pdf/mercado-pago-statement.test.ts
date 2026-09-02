import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeStatementYieldGap } from "../account-statement-balances";
import {
	dedupeImportedTransactionsByFingerprint,
	uniquifyImportedExternalIds,
} from "../helpers";
import { extractPdfText } from "../pdf-parser";
import { isInterBankStatementPdf } from "./inter-bank-statement";
import {
	isMercadoPagoBankStatementPdf,
	parseMercadoPagoBankStatementPdf,
	parseMercadoPagoStatementBalances,
	parseMercadoPagoStatementHeader,
	parseMercadoPagoStatementMovements,
} from "./mercado-pago-statement";

const EXTRATO =
	"1/3  EXTRATO DE CONTA  Franklin Diogo Aparecido Bravos Querino Dos Santos  CPF/CNPJ:   32253229890   1   70313800492 Agência:   Conta:  De 01-08-2026 al 31-08-2026 Periodo: Saldo inicial:   R$ 10,63   Entradas:   R$ 942,20  Saidas:   R$ -947,32  DETALHE DOS MOVIMENTOS  Data   Descrição   ID da operação   Valor   Saldo  03-08-2026   Rendimentos   1747687190102   R$ 0,01   R$ 10,64 05-08-2026   Rendimentos   1747841399337   R$ 0,01   R$ 10,65 05-08-2026   Pagamento de assinatura   171243324951   R$ -3,99   R$ 6,66 06-08-2026   Pix recebido BRAVOS COMPANY   171457372313   R$ 100,00   R$ 106,66 06-08-2026   Pagamento CONECTCAR   172368641964   R$ -14,30   R$ 92,36 06-08-2026   Pagamento CONECTCAR   171472270325   R$ -14,50   R$ 77,86 06-08-2026   Pagamento CONECTCAR   172376055158   R$ -3,65   R$ 74,21 06-08-2026   Pagamento CONECTCAR   171502989117   R$ -3,99   R$ 70,22 06-08-2026   Pagamento CONECTCAR   171505760175   R$ -3,65   R$ 66,57 06-08-2026   Pagamento CONECTCAR   172412793870   R$ -14,30   R$ 52,27 06-08-2026   Pagamento CONECTCAR   171511869427   R$ -14,50   R$ 37,77  Saldo final:   R$ 5,51\n2/3  Data   Descrição   ID da operação   Valor   Saldo  07-08-2026   Rendimentos   1748013347786   R$ 0,01   R$ 37,78 10-08-2026   Rendimentos   1748067752772   R$ 0,02   R$ 37,80 11-08-2026   Rendimentos   1748163974724   R$ 0,01   R$ 37,81 12-08-2026   Rendimentos   1748225636456   R$ 0,02   R$ 37,83 12-08-2026 Pagamento com QR Pix AMERICANAS S A EM RECUPERACAO JUDICIAL 173429651994   R$ -32,96   R$ 4,87 13-08-2026   Rendimentos   1748300144746   R$ 0,01   R$ 4,88 14-08-2026 Pix recebido LANDOR SOLUCOES EM TECNOLOGIA LTDA 173817339178   R$ 841,34   R$ 846,22 15-08-2026 Pagamento com QR Pix SAVEGNAGO- SUPERMERCADOS LTDA 174007366310   R$ -453,15   R$ 393,07 17-08-2026   Rendimentos   1748435371661   R$ 0,36   R$ 393,43 17-08-2026 Pagamento com QR Pix PAPER OFFICE SOLUCOES GRAFICAS II LTDA 174347311794   R$ -82,50   R$ 310,93 18-08-2026   Rendimentos   1748486532458   R$ 0,16   R$ 311,09 19-08-2026   Rendimentos   1748564261671   R$ 0,13   R$ 311,22 19-08-2026 Pix enviado Franklin Diogo Aparecido Bravos Querino dos Santos 174651155332   R$ -100,00   R$ 211,22\nData de geração: 02-09-2026 Você tem alguma dúvida? Conte com o nosso Portal de ajuda para encontrar informações sobre nossos produtos e serviços. Se deseja falar com o nosso SAC, ligue para 0800 637 7246. Você precisará de um código de atendimento para nos contatar. Se já nos contatou e precisa de ajuda da ouvidoria, ligue para 0800 688 4365 com o protocolo do primeiro atendimento. Mercado Pago Instituição de Pagamento Ltda. CNPJ n.º 10.573.521/0001-91. Av. das Nações Unidas, nº 3.003, Bonfim, Osasco SP - CEP 06233- 903. Encontre nossos canais de consulta em:www.mercadopago.com.br   3/3  Data   Descrição   ID da operação   Valor   Saldo  19-08-2026 Pagamento com QR Pix SAVEGNAGO- SUPERMERCADOS LTDA 174697530658   R$ -14,94   R$ 196,28 20-08-2026   Rendimentos   1748635078810   R$ 0,10   R$ 196,38 20-08-2026 Pagamento com QR Pix RODOSNACK LANCHONETE E RESTAURANTE JUNDIAI LTDA 173822899891   R$ -7,90   R$ 188,48 20-08-2026   Pagamento com QR Pix Zig Tecnologia S.A.   173855176497   R$ -73,00   R$ 115,48 20-08-2026 Pagamento com QR Pix ADMINISTRADORA GERAL DE ESTACIONAMENTOS S A 174826564804   R$ -100,00   R$ 15,48 20-08-2026 Pagamento com QR Pix SUCESSO REDE DE RESTAURANTES LTDA 174841477602   R$ -9,99   R$ 5,49 21-08-2026   Rendimentos   1748705535447   R$ 0,01   R$ 5,50 27-08-2026   Rendimentos   1749007742604   R$ 0,01   R$ 5,51";

const SAVEGNAGO_19 = "Pagamento com QR Pix SAVEGNAGO- SUPERMERCADOS LTDA";

describe("isMercadoPagoBankStatementPdf", () => {
	it("reconhece o extrato", () => {
		expect(isMercadoPagoBankStatementPdf(EXTRATO)).toBe(true);
	});

	it("não confunde com extrato Nubank", () => {
		expect(
			isMercadoPagoBankStatementPdf(
				"Nubank Movimentações Saldo inicial Total de entradas",
			),
		).toBe(false);
	});

	it("não confunde com extrato Inter", () => {
		expect(
			isMercadoPagoBankStatementPdf(
				"Período: Saldo por transação Saldo do dia:",
			),
		).toBe(false);
	});
});

describe("parseMercadoPagoStatementMovements", () => {
	const header = parseMercadoPagoStatementHeader(EXTRATO);
	const period = header.period;

	it("a primeira linha é Rendimentos de 03/08, sem corrupção do cabeçalho", () => {
		const { transactions } = parseMercadoPagoStatementMovements(
			EXTRATO,
			period,
		);

		expect(transactions[0]).toMatchObject({
			date: "2026-08-03",
			description: "Rendimentos",
			amount: 0.01,
			externalId: "1747687190102",
		});
	});

	it("a linha SAVEGNAGO de 19/08 sobrevive ao rodapé da página 3", () => {
		const { transactions } = parseMercadoPagoStatementMovements(
			EXTRATO,
			period,
		);
		const savegnago = transactions.find(
			(transaction) =>
				transaction.date === "2026-08-19" &&
				transaction.description === SAVEGNAGO_19,
		);

		expect(savegnago).toMatchObject({
			date: "2026-08-19",
			description: SAVEGNAGO_19,
			amount: 14.94,
			externalId: "174697530658",
		});
	});

	it("lê 32 lançamentos com cadeia de saldo fechando", () => {
		const result = parseMercadoPagoStatementMovements(EXTRATO, period);

		expect(result.transactions).toHaveLength(32);
		expect(result.chain.every((entry) => entry.balances)).toBe(true);
	});

	it("descarta linha fora do período declarado", () => {
		const comSetembro = `${EXTRATO} 05-09-2026   Rendimentos   9999999999999   R$ 0,01   R$ 5,52`;
		const result = parseMercadoPagoStatementMovements(comSetembro, period);

		expect(result.outOfPeriodCount).toBe(1);
		expect(result.transactions).toHaveLength(32);
	});

	it("descarta valor zero sem quebrar a cadeia", () => {
		const comZero = `${EXTRATO} 27-08-2026   Rendimentos   9999999999999   R$ 0,00   R$ 5,51 `;
		const result = parseMercadoPagoStatementMovements(comZero, period);

		expect(result.zeroAmountCount).toBe(1);
		expect(result.transactions).toHaveLength(32);
		expect(result.chain.every((entry) => entry.balances)).toBe(true);
	});

	it("categoria Rendimentos só nas linhas homônimas", () => {
		const { transactions } = parseMercadoPagoStatementMovements(
			EXTRATO,
			period,
		);
		const rendimentos = transactions.filter(
			(transaction) => transaction.categoryRaw === "Rendimentos",
		);

		expect(rendimentos).toHaveLength(13);
		expect(
			transactions.filter((transaction) => transaction.categoryRaw == null),
		).toHaveLength(19);
	});

	it("externalId é o ID da operação, sem sufixo sintético", () => {
		const { transactions } = parseMercadoPagoStatementMovements(
			EXTRATO,
			period,
		);

		expect(transactions[0]?.externalId).toBe("1747687190102");
		expect(transactions[0]?.externalId).not.toContain("|");

		const conectcar = transactions.filter((transaction) =>
			transaction.description.includes("CONECTCAR"),
		);
		expect(
			new Set(conectcar.map((transaction) => transaction.externalId)).size,
		).toBe(7);
		expect(uniquifyImportedExternalIds(conectcar)).toEqual(conectcar);
		expect(dedupeImportedTransactionsByFingerprint(transactions)).toHaveLength(
			32,
		);
	});
});

describe("parseMercadoPagoStatementBalances", () => {
	it("fecha com os saldos declarados no cabeçalho", () => {
		const header = parseMercadoPagoStatementHeader(EXTRATO);
		const movements = parseMercadoPagoStatementMovements(
			EXTRATO,
			header.period,
		);
		const balances = parseMercadoPagoStatementBalances(
			header,
			movements,
			header.period ?? { from: "2026-08-01", to: "2026-08-31" },
		);

		expect(balances).toMatchObject({
			openingBalance: 10.63,
			closingBalance: 5.51,
			totalIn: 942.2,
			totalOut: 947.32,
			yield: 0,
			balances: true,
		});
	});

	it("não inventa rendimento fantasma com linhas de centavos", () => {
		const statement = parseMercadoPagoBankStatementPdf(EXTRATO);

		expect(statement.accountBalances?.yield).toBe(0);
		expect(statement.accountBalances).toBeDefined();
		expect(
			computeStatementYieldGap(
				statement.accountBalances as NonNullable<
					typeof statement.accountBalances
				>,
				statement.transactions,
			),
		).toBe(0);
	});

	it("adulterar saldo corrido acusa na linha certa", () => {
		const adulterado = EXTRATO.replace(
			"1747841399337   R$ 0,01   R$ 10,65",
			"1747841399337   R$ 0,01   R$ 10,70",
		);
		const header = parseMercadoPagoStatementHeader(adulterado);
		const movements = parseMercadoPagoStatementMovements(
			adulterado,
			header.period,
		);
		const broken = movements.chain.find((entry) => !entry.balances);

		expect(broken?.index).toBe(1);
		expect(broken?.expectedBalance).toBe(10.65);
		expect(broken?.declaredBalance).toBe(10.7);
	});
});

describe("parseMercadoPagoBankStatementPdf", () => {
	it("monta statement completo", () => {
		const statement = parseMercadoPagoBankStatementPdf(EXTRATO);

		expect(statement.source).toBe("Mercado Pago");
		expect(statement.accountNumber).toBe("70313800492");
		expect(statement.isCreditCard).toBe(false);
		expect(statement.period).toEqual({ from: "2026-08-01", to: "2026-08-31" });
		expect(statement.accountHolder).toMatchObject({
			name: "Franklin Diogo Aparecido Bravos Querino Dos Santos",
			document: "32253229890",
		});
		expect(statement.transactions).toHaveLength(32);
	});

	it("recusa extrato sem movimentação", () => {
		expect(() =>
			parseMercadoPagoBankStatementPdf(
				"DETALHE DOS MOVIMENTOS ID da operação EXTRATO DE CONTA CPF/CNPJ: 12345678901 1 123 Agência: Conta:",
			),
		).toThrow(/Nenhuma transação encontrada no extrato Mercado Pago/);
	});
});

describe("detecção cruzada com Inter", () => {
	it("Inter não reivindica o Mercado Pago", () => {
		expect(isInterBankStatementPdf(EXTRATO)).toBe(false);
	});

	it("Inter não reivindica variante com Período acentuado", () => {
		const acentuado = EXTRATO.replace("Periodo:", "Período:");
		expect(isInterBankStatementPdf(acentuado)).toBe(false);
		expect(isMercadoPagoBankStatementPdf(acentuado)).toBe(true);
	});
});

const SAMPLE_PDF =
	"/Users/franklinbravos/Documents/Extratos e Faturas/mp_agosto_pdf_260902085126.pdf";

describe("amostra local do PDF real", () => {
	it.skipIf(!existsSync(SAMPLE_PDF))(
		"lê 32 lançamentos e a descrição SAVEGNAGO de 19/08 intacta",
		async () => {
			const buffer = readFileSync(SAMPLE_PDF);
			const text = await extractPdfText(
				buffer.buffer.slice(
					buffer.byteOffset,
					buffer.byteOffset + buffer.byteLength,
				),
			);
			const statement = parseMercadoPagoBankStatementPdf(text);

			expect(statement.transactions).toHaveLength(32);
			expect(statement.accountBalances).toMatchObject({
				openingBalance: 10.63,
				closingBalance: 5.51,
				balances: true,
			});

			const savegnago = statement.transactions.find(
				(transaction) =>
					transaction.date === "2026-08-19" &&
					transaction.description === SAVEGNAGO_19,
			);
			expect(savegnago).toBeDefined();
		},
	);
});
