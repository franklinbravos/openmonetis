import { describe, expect, it } from "vitest";
import {
	resolveAccountTransactionDisplayDate,
	resolveAccountTransactionPeriod,
} from "./account-statement-date";

describe("resolveAccountTransactionDisplayDate", () => {
	it("usa vencimento em lançamento em aberto", () => {
		expect(
			resolveAccountTransactionDisplayDate({
				paymentMethod: "Pix",
				isSettled: false,
				purchaseDate: "2026-09-01",
				dueDate: "2026-09-08",
			}),
		).toBe("2026-09-08");
	});

	it("usa data de pagamento em Pix quitado", () => {
		expect(
			resolveAccountTransactionDisplayDate({
				paymentMethod: "Pix",
				isSettled: true,
				purchaseDate: "2026-09-08",
				dueDate: "2026-09-05",
			}),
		).toBe("2026-09-08");
	});

	it("usa dt_pagamento_boleto em boleto quitado", () => {
		expect(
			resolveAccountTransactionDisplayDate({
				paymentMethod: "Boleto",
				isSettled: true,
				purchaseDate: "2026-09-05",
				dueDate: "2026-09-05",
				boletoPaymentDate: "2026-09-08",
			}),
		).toBe("2026-09-08");
	});
});

describe("resolveAccountTransactionPeriod", () => {
	it("agrupa condomínio pago em setembro pela data de pagamento", () => {
		expect(
			resolveAccountTransactionPeriod({
				paymentMethod: "Pix",
				isSettled: true,
				purchaseDate: "2026-09-08",
				dueDate: "2026-09-08",
			}),
		).toBe("2026-09");
	});

	it("agrupa boleto em aberto pelo vencimento", () => {
		expect(
			resolveAccountTransactionPeriod({
				paymentMethod: "Boleto",
				isSettled: false,
				purchaseDate: "2026-09-01",
				dueDate: "2026-10-05",
			}),
		).toBe("2026-10");
	});
});

