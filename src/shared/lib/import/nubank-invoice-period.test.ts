import { describe, expect, it } from "vitest";
import {
	deriveNubankInvoicePeriodFromDueDate,
	resolveNubankInvoicePeriod,
} from "./nubank-invoice-period";

describe("resolveNubankInvoicePeriod", () => {
	it("prioriza o mês de vencimento sobre o fim do ciclo", () => {
		expect(
			resolveNubankInvoicePeriod({
				billingWindowEndDate: "2026-01-05",
				dueDate: "2026-02-05",
			}),
		).toBe("2026-02");
	});

	it("usa janeiro quando o vencimento é em janeiro", () => {
		expect(deriveNubankInvoicePeriodFromDueDate("2026-01-12")).toBe("2026-01");
	});

	it("usa fevereiro quando o vencimento é em fevereiro", () => {
		expect(deriveNubankInvoicePeriodFromDueDate("2026-02-08")).toBe("2026-02");
	});

	it("cai no fim do ciclo quando não há vencimento", () => {
		expect(
			resolveNubankInvoicePeriod({
				billingWindowEndDate: "2026-01-05",
			}),
		).toBe("2026-01");
	});
});
