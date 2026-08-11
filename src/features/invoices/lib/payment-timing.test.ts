import { describe, expect, it } from "vitest";
import { resolveInvoicePaymentTiming } from "./payment-timing";

describe("resolveInvoicePaymentTiming", () => {
	it("não marca atraso quando pagamento ocorre no próximo dia útil após vencimento em fim de semana", () => {
		const timing = resolveInvoicePaymentTiming("2025-07-28", "2025-07", "26");

		expect(timing).not.toBeNull();
		expect(timing?.dueDate).toBe("2025-07-26");
		expect(timing?.effectiveDueDate).toBe("2025-07-28");
		expect(timing?.isLate).toBe(false);
		expect(timing?.dueDateAdjustedForWeekend).toBe(true);
	});

	it("marca atraso quando pagamento ocorre após o prazo útil ajustado", () => {
		const timing = resolveInvoicePaymentTiming("2025-07-29", "2025-07", "26");

		expect(timing).not.toBeNull();
		expect(timing?.isLate).toBe(true);
		expect(timing?.lateDays).toBe(1);
	});

	it("marca atraso em vencimento em dia útil", () => {
		const timing = resolveInvoicePaymentTiming("2025-08-16", "2025-08", "15");

		expect(timing).not.toBeNull();
		expect(timing?.isLate).toBe(true);
		expect(timing?.lateDays).toBe(1);
	});
});
