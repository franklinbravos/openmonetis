import { describe, expect, it } from "vitest";
import {
	computeStatementMonthNetFromFileRows,
	computeStatementYieldGap,
	expectedStatementMonthNet,
	getPreviousPeriodLastDate,
	isAccountBalanceAdjustmentLabel,
	resolveBalanceAdjustmentPlacement,
	shouldRelocateBalanceAdjustmentRow,
} from "./account-statement-balances";

describe("account-statement-balances", () => {
	it("identifica ajuste de saldo pelo nome", () => {
		expect(isAccountBalanceAdjustmentLabel("Ajuste de saldo")).toBe(true);
		expect(isAccountBalanceAdjustmentLabel("Pix recebido")).toBe(false);
	});

	it("reloca ajuste de saldo que caiu no mês do extrato", () => {
		expect(
			shouldRelocateBalanceAdjustmentRow(
				"2026-01-15",
				"Ajuste de saldo",
				"2026-01",
			),
		).toBe(true);
		expect(
			shouldRelocateBalanceAdjustmentRow(
				"2025-12-31",
				"Ajuste de saldo",
				"2026-01",
			),
		).toBe(false);
	});

	it("último dia do mês anterior ao extrato", () => {
		expect(getPreviousPeriodLastDate("2026-01")).toBe("2025-12-31");
	});

	it("rendimento do cabeçalho só entra quando falta nas linhas", () => {
		const balances = {
			openingBalance: 100,
			closingBalance: 105,
			yield: 5,
			periodFrom: "2026-01-01",
			periodTo: "2026-01-31",
			balances: true,
		};

		expect(computeStatementYieldGap(balances, [])).toBe(5);
		expect(
			computeStatementYieldGap(balances, [
				{
					date: "2026-01-02",
					description: "Rendimento líquido",
					amount: 5,
					transactionType: "income",
				},
			]),
		).toBe(0);
	});

	it("variação líquida esperada no mês", () => {
		expect(
			expectedStatementMonthNet({
				openingBalance: 241.06,
				closingBalance: 1216.95,
				periodFrom: "2026-01-01",
				periodTo: "2026-01-31",
				balances: true,
			}),
		).toBe(975.89);
	});

	it("soma líquida das linhas do arquivo no mês do extrato", () => {
		const net = computeStatementMonthNetFromFileRows(
			[
				{
					date: "2026-08-05",
					description: "Pix enviado",
					amount: 100,
					transactionType: "expense",
				},
				{
					date: "2026-08-20",
					description: "Pix recebido",
					amount: 50,
					transactionType: "income",
				},
				{
					date: "2026-08-31",
					description: "Ajuste de saldo",
					amount: 999,
					transactionType: "income",
				},
			],
			"2026-08",
		);

		expect(net).toBe(-50);
	});
});

describe("resolveBalanceAdjustmentPlacement", () => {
	it("põe o ajuste no último dia do mês anterior ao extrato", () => {
		expect(resolveBalanceAdjustmentPlacement("2026-08")).toEqual({
			period: "2026-07",
			date: "2026-07-31",
		});
	});

	it("importar para trás faz o ajuste recuar um mês por vez", () => {
		// É o fluxo de quem começa pelo mês mais recente e vai voltando: cada
		// extrato importado transforma um mês em movimento real e empurra o
		// andaime para a véspera do mês seguinte a importar.
		const cadeia = ["2026-08", "2026-07", "2026-06", "2026-05"].map(
			(period) => resolveBalanceAdjustmentPlacement(period).period,
		);

		expect(cadeia).toEqual(["2026-07", "2026-06", "2026-05", "2026-04"]);
	});

	it("o ajuste deixado pelo mês seguinte é o que o mês anterior reloca", () => {
		// Invariante da cadeia: o ajuste que agosto cria cai exatamente no mês que
		// julho vai importar, então julho o encontra e o empurra. Se deixasse de
		// cair ali, cada importação criaria um ajuste novo e eles se somariam.
		const agosto = resolveBalanceAdjustmentPlacement("2026-08");
		const julho = resolveBalanceAdjustmentPlacement("2026-07");

		expect(agosto.period).toBe("2026-07");
		expect(
			shouldRelocateBalanceAdjustmentRow(
				agosto.date,
				"Ajuste de saldo",
				"2026-07",
			),
		).toBe(true);
		expect(julho.period).toBe("2026-06");
	});

	it("atravessa a virada de ano", () => {
		expect(resolveBalanceAdjustmentPlacement("2026-01")).toEqual({
			period: "2025-12",
			date: "2025-12-31",
		});
	});

	it("fevereiro do ano bissexto termina no dia 29", () => {
		expect(resolveBalanceAdjustmentPlacement("2028-03").date).toBe(
			"2028-02-29",
		);
	});
});
