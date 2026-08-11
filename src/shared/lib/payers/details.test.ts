import { describe, expect, it } from "vitest";
import { buildPayerBoletoStats, type PayerBoletoStatsRow } from "./details";

describe("buildPayerBoletoStats", () => {
	it("acumula pago e pendente a partir das linhas do RPC", () => {
		const rows: PayerBoletoStatsRow[] = [
			{ is_settled: true, total_amount: "100.50", total_count: "2" },
			{ is_settled: false, total_amount: "-50.25", total_count: "1" },
		];

		const stats = buildPayerBoletoStats(rows);

		expect(stats).toEqual({
			totalAmount: 150.75,
			paidAmount: 100.5,
			pendingAmount: 50.25,
			paidCount: 2,
			pendingCount: 1,
		});
	});

	it("trata valores nulos como zero", () => {
		const rows: PayerBoletoStatsRow[] = [
			{ is_settled: true, total_amount: null, total_count: null },
			{ is_settled: false, total_amount: null, total_count: null },
		];

		const stats = buildPayerBoletoStats(rows);

		expect(stats).toEqual({
			totalAmount: 0,
			paidAmount: 0,
			pendingAmount: 0,
			paidCount: 0,
			pendingCount: 0,
		});
	});

	it("trata is_settled null como pendente e aceita count numérico", () => {
		const rows: PayerBoletoStatsRow[] = [
			{ is_settled: null, total_amount: -30, total_count: 1 },
		];

		const stats = buildPayerBoletoStats(rows);

		expect(stats).toEqual({
			totalAmount: 30,
			paidAmount: 0,
			pendingAmount: 30,
			paidCount: 0,
			pendingCount: 1,
		});
	});
});
