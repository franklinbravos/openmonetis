import { describe, expect, it } from "vitest";
import {
	computeStatementMonthNetFromFileRows,
	computeStatementYieldGap,
	expectedStatementMonthNet,
	getPreviousPeriodLastDate,
	isAccountBalanceAdjustmentLabel,
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
