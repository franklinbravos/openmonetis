import { describe, expect, it } from "vitest";
import {
	resolveTransactionDueDate,
	resolveTransactionPaymentDate,
} from "./form-helpers";

describe("resolveTransactionPaymentDate", () => {
	it("usa boletoPaymentDate em boleto quitado", () => {
		expect(
			resolveTransactionPaymentDate({
				paymentMethod: "Boleto",
				isSettled: true,
				purchaseDate: "2026-08-07",
				boletoPaymentDate: "2026-08-10",
			}),
		).toBe("2026-08-10");
	});

	it("ignora cartão de crédito", () => {
		expect(
			resolveTransactionPaymentDate({
				paymentMethod: "Cartão de crédito",
				isSettled: true,
				purchaseDate: "2026-08-07",
			}),
		).toBeNull();
	});
});

describe("resolveTransactionDueDate", () => {
	it("mantém vencimento existente", () => {
		expect(
			resolveTransactionDueDate({
				dueDate: "2026-08-05",
				paymentMethod: "Boleto",
				isSettled: true,
				purchaseDate: "2026-08-07",
				boletoPaymentDate: "2026-08-10",
			}),
		).toBe("2026-08-05");
	});

	it("preenche vencimento com pagamento em lançamento antigo quitado", () => {
		expect(
			resolveTransactionDueDate({
				dueDate: null,
				paymentMethod: "Pix",
				isSettled: true,
				purchaseDate: "2026-08-07",
			}),
		).toBe("2026-08-07");
	});

	it("não inventa vencimento para lançamento em aberto", () => {
		expect(
			resolveTransactionDueDate({
				dueDate: null,
				paymentMethod: "Boleto",
				isSettled: false,
				purchaseDate: "2026-08-07",
			}),
		).toBeNull();
	});
});
