import { describe, expect, it } from "vitest";
import type { InvoiceReconciliationReviewRow } from "./invoice-total";
import {
	computeImportReconciliation,
	isInvoiceTotalReconciled,
	resolveInvoiceClosingTarget,
	resolveInvoiceDisplayTotal,
	resolveInvoicePaymentRoundingDelta,
	sumSignedAmountsForReviewRows,
} from "./invoice-total";

const baseRow = (
	overrides: Partial<InvoiceReconciliationReviewRow>,
): InvoiceReconciliationReviewRow => ({
	externalId: "fit-1",
	amount: 100,
	transactionType: "expense",
	kind: "transaction",
	selected: true,
	isDuplicate: false,
	description: "Compra",
	date: "2026-01-10",
	...overrides,
});

describe("sumSignedAmountsForReviewRows", () => {
	it("ignora pagamentos de fatura e transferências", () => {
		const total = sumSignedAmountsForReviewRows(
			[
				baseRow({ amount: 100, kind: "transaction" }),
				baseRow({
					kind: "invoice_payment",
					description: "Pagamento recebido",
					transactionType: "income",
				}),
				baseRow({ kind: "transfer", amount: 200 }),
			],
			{ importableOnly: true },
		);

		expect(total).toBe(-100);
	});

	it("não soma duplicatas não marcadas para reimportação", () => {
		const total = sumSignedAmountsForReviewRows(
			[
				baseRow({ amount: 100, isDuplicate: true, selected: false }),
				baseRow({ amount: 50, isDuplicate: true, reimported: true }),
			],
			{ importableOnly: true },
		);

		expect(total).toBe(-50);
	});
});

describe("computeImportReconciliation", () => {
	it("calcula delta entre total projetado e total do arquivo", () => {
		const result = computeImportReconciliation({
			sourceTotal: 7301.6,
			reviewRows: [baseRow({ amount: 100, externalId: "new-1" })],
			existingRows: [
				{
					id: "existing-1",
					ofxFitId: "old-fit",
					name: "Manual",
					amount: "-7201.60",
					transactionType: "Despesa",
				},
			],
			fileExternalIds: ["new-1"],
		});

		expect(result.projectedDisplayTotal).toBe(7301.6);
		expect(result.delta).toBe(0);
		expect(result.extraExistingRows).toHaveLength(1);
		expect(result.pendingImportRows).toHaveLength(1);
		expect(isInvoiceTotalReconciled(result.delta)).toBe(true);
	});

	it("não trata como extra um cadastro que bate com o arquivo por nome e valor", () => {
		const result = computeImportReconciliation({
			sourceTotal: 24.9,
			reviewRows: [
				baseRow({
					externalId: "fit-amazon",
					amount: 24.9,
					description: "Amazon Kindle Unltd",
					isDuplicate: true,
					selected: false,
				}),
			],
			existingRows: [
				{
					id: "registered-1",
					ofxFitId: null,
					name: "Amazon Kindle Unltd",
					amount: "-24.90",
					transactionType: "Despesa",
				},
			],
			fileExternalIds: ["fit-amazon"],
		});

		expect(result.extraExistingRows).toHaveLength(0);
	});

	it("identifica lançamentos extras no período", () => {
		const result = computeImportReconciliation({
			sourceTotal: 100,
			reviewRows: [],
			existingRows: [
				{
					id: "extra-1",
					ofxFitId: null,
					name: "Extra manual",
					amount: "-262.26",
					transactionType: "Despesa",
				},
			],
			fileExternalIds: [],
		});

		expect(result.delta).toBe(162.26);
		expect(result.extraExistingRows[0]?.id).toBe("extra-1");
	});

	it("identifica divergência de valor para o mesmo FITID", () => {
		const result = computeImportReconciliation({
			sourceTotal: 100,
			reviewRows: [
				baseRow({
					externalId: "fit-1",
					amount: 80,
					isDuplicate: true,
					selected: false,
				}),
			],
			existingRows: [
				{
					id: "existing-1",
					ofxFitId: "fit-1",
					name: "Compra",
					amount: "-100",
					transactionType: "Despesa",
				},
			],
			fileExternalIds: ["fit-1"],
		});

		expect(result.amountMismatchRows).toHaveLength(1);
		expect(result.amountMismatchRows[0]?.signedDelta).toBe(-20);
		expect(result.extraExistingRows).toHaveLength(0);
	});

	it("desconta duplicatas marcadas para remoção do total projetado", () => {
		const result = computeImportReconciliation({
			sourceTotal: 7301.59,
			reviewRows: [
				baseRow({
					externalId: "fit-parcela",
					amount: 260,
					description: "Fabio C Thomaziello - Parcela 5/10",
					isDuplicate: true,
					selected: false,
				}),
				baseRow({
					externalId: null,
					amount: 292.19,
					description: "Compra duplicada",
					kind: "invoice_extra",
					selected: true,
					existingTransactionId: "extra-dup",
				}),
			],
			existingRows: [
				{
					id: "conferido-1",
					ofxFitId: "fit-parcela",
					name: "Fabio C Thomaziello - Parcela 5/10",
					amount: "-260.00",
					transactionType: "Despesa",
				},
				{
					id: "extra-dup",
					ofxFitId: null,
					name: "Compra duplicada",
					amount: "-292.19",
					transactionType: "Despesa",
				},
				{
					id: "resto",
					ofxFitId: "fit-resto",
					name: "Demais lançamentos",
					amount: "-7041.59",
					transactionType: "Despesa",
				},
			],
			fileExternalIds: ["fit-parcela", "fit-resto"],
		});

		expect(result.projectedDisplayTotal).toBe(7301.59);
		expect(result.delta).toBe(0);
		expect(isInvoiceTotalReconciled(result.delta)).toBe(true);
	});

	it("lista linhas do arquivo ainda não cadastradas", () => {
		const result = computeImportReconciliation({
			sourceTotal: 200,
			reviewRows: [
				baseRow({
					externalId: "new-1",
					amount: 50,
					selected: false,
					isDuplicate: false,
				}),
			],
			existingRows: [],
			fileExternalIds: ["new-1"],
		});

		expect(result.missingFileRows).toHaveLength(1);
		expect(result.missingFileRows[0]?.reason).toBe("not_selected");
	});
});

describe("resolveInvoiceClosingTarget", () => {
	it("mira na soma das linhas quando o arquivo arredonda um centavo", () => {
		expect(
			resolveInvoiceClosingTarget({
				sourceTotal: 7301.59,
				fileRowsTotal: 7301.6,
			}),
		).toEqual({ target: 7301.6, rounding: -0.01, unexplained: 0 });
	});

	it("mantém o total declarado quando faltam linhas no arquivo", () => {
		expect(
			resolveInvoiceClosingTarget({
				sourceTotal: 6003.17,
				fileRowsTotal: 5946.89,
			}),
		).toEqual({ target: 6003.17, rounding: 0, unexplained: 56.28 });
	});

	it("usa o total declarado quando não há linhas para comparar", () => {
		expect(
			resolveInvoiceClosingTarget({ sourceTotal: 100, fileRowsTotal: null }),
		).toEqual({ target: 100, rounding: 0, unexplained: 0 });
	});
});

describe("resolveInvoicePaymentRoundingDelta", () => {
	it("fecha pelo valor do arquivo quando falta um centavo", () => {
		expect(
			resolveInvoicePaymentRoundingDelta({
				sourceTotal: 7301.59,
				registeredTotal: 7301.6,
			}),
		).toBe(-0.01);
	});

	it("aceita até dois centavos", () => {
		expect(
			resolveInvoicePaymentRoundingDelta({
				sourceTotal: 100.02,
				registeredTotal: 100,
			}),
		).toBe(0.02);
	});

	it("recusa três centavos: diferença tem causa concreta", () => {
		expect(
			resolveInvoicePaymentRoundingDelta({
				sourceTotal: 100.03,
				registeredTotal: 100,
			}),
		).toBe(0);
	});

	it("recusa divergência grande, como linha faltando no arquivo", () => {
		expect(
			resolveInvoicePaymentRoundingDelta({
				sourceTotal: 6003.17,
				registeredTotal: 5946.89,
			}),
		).toBe(0);
	});

	it("não mexe quando não há total de arquivo", () => {
		expect(
			resolveInvoicePaymentRoundingDelta({
				sourceTotal: 0,
				registeredTotal: 100,
			}),
		).toBe(0);
	});
});

describe("resolveInvoiceDisplayTotal", () => {
	it("mostra o total do arquivo quando a soma diverge um centavo", () => {
		expect(
			resolveInvoiceDisplayTotal({
				registeredTotal: -7301.6,
				sourceTotal: 7301.59,
			}),
		).toBe(7301.59);
	});

	it("mostra a soma dos lançamentos quando a diferença é real", () => {
		expect(
			resolveInvoiceDisplayTotal({
				registeredTotal: -5946.89,
				sourceTotal: 6003.17,
			}),
		).toBe(5946.89);
	});

	it("mostra a soma quando não há total de arquivo", () => {
		expect(
			resolveInvoiceDisplayTotal({
				registeredTotal: -1234.56,
				sourceTotal: null,
			}),
		).toBe(1234.56);
	});
});
