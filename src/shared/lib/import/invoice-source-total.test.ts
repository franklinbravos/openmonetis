import { describe, expect, it } from "vitest";
import { resolveInvoiceSourceTotal } from "./invoice-source-total";
import type { ImportStatement } from "./types";

function buildStatement(
	overrides: Partial<ImportStatement> = {},
): ImportStatement {
	return {
		source: "Nubank",
		accountNumber: null,
		period: null,
		isCreditCard: false,
		transactions: [],
		invoice: null,
		...overrides,
	};
}

describe("resolveInvoiceSourceTotal", () => {
	it("retorna null para extrato de conta", () => {
		expect(
			resolveInvoiceSourceTotal(
				buildStatement({
					isCreditCard: false,
					invoice: {
						period: "2026-02",
						dueDate: "2026-02-12",
						isPaid: false,
						paymentDate: null,
						totalAmount: 100,
						totalAmountSource: "ofx_ledger",
					},
				}),
			),
		).toBeNull();
	});

	it("usa total OFX com confiança alta", () => {
		expect(
			resolveInvoiceSourceTotal(
				buildStatement({
					isCreditCard: true,
					invoice: {
						period: "2026-02",
						dueDate: "2026-02-12",
						isPaid: false,
						paymentDate: null,
						totalAmount: 7301.6,
						totalAmountSource: "ofx_ledger",
					},
				}),
			),
		).toEqual({
			amount: 7301.6,
			source: "ofx_ledger",
			confidence: "high",
		});
	});

	it("marca PDF inferido quando veio da soma das linhas", () => {
		expect(
			resolveInvoiceSourceTotal(
				buildStatement({
					isCreditCard: true,
					invoice: {
						period: "2026-02",
						dueDate: "2026-02-12",
						isPaid: false,
						paymentDate: null,
						totalAmount: 150,
						totalAmountSource: "pdf_lines_fallback",
					},
				}),
			),
		).toEqual({
			amount: 150,
			source: "pdf_lines_fallback",
			confidence: "inferred",
		});
	});

	it("cai no fallback das linhas quando metadata não tem total", () => {
		expect(
			resolveInvoiceSourceTotal(
				buildStatement({
					isCreditCard: true,
					transactions: [
						{
							externalId: "1",
							date: "2026-01-10",
							amount: 100,
							description: "Compra",
							transactionType: "expense",
						},
						{
							externalId: "2",
							date: "2026-01-11",
							amount: 50,
							description: "Estorno",
							transactionType: "income",
						},
					],
				}),
			),
		).toEqual({
			amount: 50,
			source: "lines_fallback",
			confidence: "inferred",
		});
	});
});
