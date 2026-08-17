import { describe, expect, it } from "vitest";
import type { SelectOption } from "@/features/transactions/components/types";
import {
	resolveAccountStatementDateRange,
	resolveCreditCardInvoicePeriodFromImportStatement,
	resolveCreditCardInvoicePeriodFromMetadata,
	resolveCreditCardInvoicePeriodFromStatement,
	resolveUploadInvoicePeriodFromStatement,
} from "@/features/transactions/lib/import-invoice-period";
import type { ImportStatement } from "@/shared/lib/import/types";

const cardOption: SelectOption = {
	value: "card-1",
	label: "Nubank",
	closingDay: "5",
	dueDay: "12",
};

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

describe("resolveCreditCardInvoicePeriodFromMetadata", () => {
	it("prioriza period sobre dueDate", () => {
		expect(
			resolveCreditCardInvoicePeriodFromMetadata({
				period: "2026-02",
				dueDate: "2026-03-12",
				isPaid: false,
				paymentDate: null,
				totalAmount: null,
			}),
		).toBe("2026-02");
	});

	it("usa dueDate quando period ausente", () => {
		expect(
			resolveCreditCardInvoicePeriodFromMetadata({
				period: null,
				dueDate: "2026-02-12",
				isPaid: false,
				paymentDate: null,
				totalAmount: null,
			}),
		).toBe("2026-02");
	});
});

describe("resolveCreditCardInvoicePeriodFromStatement", () => {
	it("retorna null para extrato de conta", () => {
		const statement = buildStatement({
			isCreditCard: false,
			invoice: {
				period: "2026-02",
				dueDate: "2026-02-12",
				isPaid: false,
				paymentDate: null,
				totalAmount: null,
			},
		});

		expect(
			resolveCreditCardInvoicePeriodFromStatement(statement, cardOption),
		).toBeNull();
	});

	it("resolve periodo de fatura a partir dos metadados", () => {
		const statement = buildStatement({
			isCreditCard: true,
			invoice: {
				period: "2026-02",
				dueDate: "2026-02-12",
				isPaid: false,
				paymentDate: null,
				totalAmount: null,
			},
		});

		expect(
			resolveCreditCardInvoicePeriodFromStatement(statement, cardOption),
		).toBe("2026-02");
	});
});

describe("resolveAccountStatementDateRange", () => {
	it("retorna null para fatura de cartao", () => {
		const statement = buildStatement({
			isCreditCard: true,
			period: { from: "2026-01-01", to: "2026-01-31" },
		});

		expect(resolveAccountStatementDateRange(statement)).toBeNull();
	});

	it("usa period do extrato bancario", () => {
		const statement = buildStatement({
			isCreditCard: false,
			period: { from: "2026-01-01", to: "2026-01-31" },
		});

		expect(resolveAccountStatementDateRange(statement)).toEqual({
			from: "2026-01-01",
			to: "2026-01-31",
		});
	});

	it("deriva intervalo das transacoes quando period ausente", () => {
		const statement = buildStatement({
			isCreditCard: false,
			transactions: [
				{
					externalId: null,
					date: "2026-01-10",
					amount: -10,
					description: "Compra",
					transactionType: "expense",
				},
				{
					externalId: null,
					date: "2026-01-20",
					amount: 100,
					description: "Salario",
					transactionType: "income",
				},
			],
		});

		expect(resolveAccountStatementDateRange(statement)).toEqual({
			from: "2026-01-10",
			to: "2026-01-20",
		});
	});
});

describe("resolveUploadInvoicePeriodFromStatement", () => {
	it("nao infere periodo de fatura em extrato de conta", () => {
		const statement = buildStatement({
			isCreditCard: false,
			invoice: {
				period: "2026-02",
				dueDate: "2026-02-12",
				isPaid: false,
				paymentDate: null,
				totalAmount: null,
			},
		});

		expect(
			resolveUploadInvoicePeriodFromStatement(statement, {
				selectedCardOption: cardOption,
				fallbackPeriod: null,
			}),
		).toBeNull();
	});

	it("resolve periodo de fatura para cartao", () => {
		const statement = buildStatement({
			isCreditCard: true,
			invoice: {
				period: "2026-02",
				dueDate: "2026-02-12",
				isPaid: false,
				paymentDate: null,
				totalAmount: null,
			},
		});

		expect(
			resolveUploadInvoicePeriodFromStatement(statement, {
				selectedCardOption: cardOption,
				fallbackPeriod: "2026-01",
			}),
		).toBe("2026-02");
	});
});

describe("resolveCreditCardInvoicePeriodFromImportStatement", () => {
	it("ignora metadados de invoice em extrato de conta", () => {
		const statement = buildStatement({
			isCreditCard: false,
			invoice: {
				period: "2026-02",
				dueDate: "2026-02-12",
				isPaid: false,
				paymentDate: null,
				totalAmount: null,
			},
		});

		expect(
			resolveCreditCardInvoicePeriodFromImportStatement(
				statement,
				[cardOption],
				"card-1",
			),
		).toBeNull();
	});
});
