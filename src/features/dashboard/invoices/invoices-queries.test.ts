import { describe, expect, it } from "vitest";
import {
	buildInvoicePagadorBreakdown,
	type RawInvoiceBreakdownRow,
} from "./invoices-queries";

const buildRow = (
	overrides: Partial<RawInvoiceBreakdownRow> = {},
): RawInvoiceBreakdownRow => ({
	cardId: "card-1",
	period: "2026-08",
	payerId: "payer-1",
	pagadorName: "Maria",
	pagadorAvatar: null,
	amount: "100",
	...overrides,
});

describe("buildInvoicePagadorBreakdown", () => {
	it("agrupa por cardId+payerId somando período atual e anterior", () => {
		const rows = [
			buildRow({ period: "2026-08", amount: "-200" }),
			buildRow({ period: "2026-07", amount: "-100" }),
		];

		const breakdown = buildInvoicePagadorBreakdown(rows, "2026-08", "2026-07");

		const shares = breakdown.get("card-1:2026-08");
		expect(shares).toHaveLength(1);
		expect(shares?.[0]).toEqual({
			payerId: "payer-1",
			pagadorName: "Maria",
			pagadorAvatar: null,
			amount: 200,
			percentageChange: 100,
		});
	});

	it("agrupa lançamento sem pessoa como __without-payer__ com nome Sem pessoa", () => {
		const rows = [
			buildRow({ payerId: null, pagadorName: null, amount: "-50" }),
		];

		const breakdown = buildInvoicePagadorBreakdown(rows, "2026-08", "2026-07");

		const shares = breakdown.get("card-1:2026-08");
		expect(shares).toHaveLength(1);
		expect(shares?.[0]).toEqual({
			payerId: null,
			pagadorName: "Sem pessoa",
			pagadorAvatar: null,
			amount: 50,
			percentageChange: 100,
		});
	});

	it("ignora lançamentos sem cartão, com valor zero e sem lançamento no período atual", () => {
		const rows = [
			buildRow({ cardId: null }),
			buildRow({ amount: "0" }),
			buildRow({ period: "2026-07", amount: "-80" }),
		];

		const breakdown = buildInvoicePagadorBreakdown(rows, "2026-08", "2026-07");

		expect(breakdown.size).toBe(0);
	});
});
