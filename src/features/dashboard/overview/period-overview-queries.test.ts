import { describe, expect, it } from "vitest";
import {
	buildPeriodTotals,
	type PeriodSummaryRow,
} from "./period-overview-queries";

const makeRow = (overrides: Partial<PeriodSummaryRow>): PeriodSummaryRow => ({
	period: "2026-08",
	transactionType: "Receita",
	isSettled: true,
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
			receitasRealizadas: 1000,
			despesasRealizadas: 300,
			reembolsos: 100,
			reembolsosRealizados: 100,
			transferAdjustment: 50,
			balanco: 0,
		});
	});

	it("separa o que já foi efetivado do que só está previsto", () => {
		// É a diferença entre "entrou" e "vai entrar": setembro/2026 tinha
		// R$ 33.000,00 de receita lançada e nenhum centavo efetivado, e o card
		// mostrava os R$ 33.000,00 como entrada do período.
		const rows: PeriodSummaryRow[] = [
			makeRow({ transactionType: "Receita", totalAmount: "3000" }),
			makeRow({
				transactionType: "Receita",
				totalAmount: "30000",
				isSettled: false,
			}),
			makeRow({ transactionType: "Despesa", totalAmount: "-200" }),
			makeRow({
				transactionType: "Despesa",
				totalAmount: "-800",
				isSettled: false,
			}),
		];

		const totals = buildPeriodTotals(rows).get("2026-08");

		expect(totals?.receitas).toBe(33000);
		expect(totals?.receitasRealizadas).toBe(3000);
		expect(totals?.despesas).toBe(1000);
		expect(totals?.despesasRealizadas).toBe(200);
	});

	it("mês sem nada efetivado tem previsão, não entrada", () => {
		const rows: PeriodSummaryRow[] = [
			makeRow({
				transactionType: "Receita",
				totalAmount: "33000",
				isSettled: false,
			}),
		];

		const totals = buildPeriodTotals(rows).get("2026-08");

		expect(totals?.receitasRealizadas).toBe(0);
		expect(totals?.receitas).toBe(33000);
	});

	it("reembolso não efetivado não abate a despesa efetivada", () => {
		const rows: PeriodSummaryRow[] = [
			makeRow({ transactionType: "Despesa", totalAmount: "-500" }),
			makeRow({
				transactionType: "Despesa",
				totalAmount: "0",
				refundAmount: "-100",
				isSettled: false,
			}),
		];

		const totals = buildPeriodTotals(rows).get("2026-08");

		expect(totals?.reembolsos).toBe(100);
		expect(totals?.reembolsosRealizados).toBe(0);
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
