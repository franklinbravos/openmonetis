import { describe, expect, it } from "vitest";
import {
	deriveNubankInvoicePeriodFromDueDate,
	resolveNubankInvoicePeriod,
} from "./nubank-invoice-period";

describe("resolveNubankInvoicePeriod", () => {
	it("prioriza o fim do ciclo de TRANSAÇÕES", () => {
		expect(
			resolveNubankInvoicePeriod({
				billingWindowEndDate: "2026-01-05",
				dueDate: "2026-02-05",
			}),
		).toBe("2026-01");
	});

	it("deduz janeiro a partir de vencimento em fevereiro", () => {
		expect(deriveNubankInvoicePeriodFromDueDate("2026-02-08")).toBe("2026-01");
	});
});
