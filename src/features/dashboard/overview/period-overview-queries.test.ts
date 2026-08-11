import { describe, expect, it } from "vitest";
import {
	buildPeriodTotals,
	type PeriodSummaryRow,
} from "./period-overview-queries";

const makeRow = (overrides: Partial<PeriodSummaryRow>): PeriodSummaryRow => ({
	period: "2026-08",
	transactionType: "Receita",
	totalAmount: "0",
	refundAmount: null,
	accountExcludeFromBalance: false,
	...overrides,
});

describe("buildPeriodTotals", () => {
	it("acumula receitas, despesas, reembolsos e transferências por período", () => {
		const rows: PeriodSummaryRow[] = [
			makeRow({ transactionType: "Receita", totalAmount: "1000" }),
			makeRow({ transactionType: "Despesa", totalAmount: "-300" }),
			makeRow({
				transactionType: "Despesa",
				totalAmount: "0",
				refundAmount: "-100",
			}),
			makeRow({ transactionType: "Transferência", totalAmount: "50" }),
		];

		const totals = buildPeriodTotals(rows).get("2026-08");

		expect(totals).toEqual({
			receitas: 1000,
			despesas: 300,
			reembolsos: 100,
			transferAdjustment: 50,
			balanco: 0,
		});
	});

	it("ignora linhas sem período", () => {
		const rows: PeriodSummaryRow[] = [
			makeRow({ period: null, totalAmount: "999" }),
		];

		const periodTotals = buildPeriodTotals(rows);

		expect(periodTotals.size).toBe(0);
	});

	it("não soma transferência de conta excluída do saldo", () => {
		const rows: PeriodSummaryRow[] = [
			makeRow({
				transactionType: "Transferência",
				totalAmount: "120",
				accountExcludeFromBalance: true,
			}),
		];

		const totals = buildPeriodTotals(rows).get("2026-08");

		expect(totals?.transferAdjustment).toBe(0);
		expect(totals?.balanco).toBe(0);
	});
});
