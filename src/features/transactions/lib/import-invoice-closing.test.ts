import { describe, expect, it } from "vitest";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import {
	applyExistingAmountEdits,
	collectExistingAmountEdits,
} from "@/features/transactions/lib/import-amount-edit";
import type { ImportDuplicateSnapshot } from "@/features/transactions/lib/import-duplicate-match";
import { applyInvoiceClosingToReviewRows } from "@/features/transactions/lib/import-invoice-closing";
import {
	isInvoiceExtraReviewRow,
	mergeInvoiceReviewRowsWithExtras,
} from "@/features/transactions/lib/import-invoice-extra-rows";
import {
	mapDuplicateSnapshotToExistingRow,
	mapReviewRowToReconciliationRow,
} from "@/features/transactions/lib/import-invoice-reconciliation";
import { computeImportReconciliation } from "@/shared/lib/import/invoice-total";

function fileRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
	return {
		reviewKey: crypto.randomUUID(),
		externalId: null,
		date: "2026-01-05",
		amount: 100,
		description: "COMPRA CARTAO",
		sourceDescription: "COMPRA CARTAO",
		transactionType: "expense",
		selected: true,
		isDuplicate: false,
		duplicateValidation: null,
		categoryId: null,
		payerId: null,
		kind: "transaction",
		invoicePaymentCardId: null,
		invoicePaymentPeriod: null,
		transferPeerAccountId: null,
		installmentImport: null,
		recurrenceImport: null,
		...overrides,
	};
}

function snapshot(
	overrides: Partial<ImportDuplicateSnapshot> &
		Pick<ImportDuplicateSnapshot, "id">,
): ImportDuplicateSnapshot {
	return {
		ofxFitId: null,
		name: "Compra",
		amount: "-100.00",
		purchaseDate: "2026-01-05",
		transactionType: "Despesa",
		currentInstallment: null,
		installmentCount: null,
		payerId: "payer-1",
		categoryId: "cat-1",
		period: "2026-01",
		...overrides,
	};
}

describe("applyInvoiceClosingToReviewRows", () => {
	it("confere o cadastro humanizado sem apagar e recriar", () => {
		const rows = applyInvoiceClosingToReviewRows({
			rows: [
				fileRow({
					description: "DROGASIL2832",
					sourceDescription: "DROGASIL2832",
				}),
			],
			snapshots: [snapshot({ id: "manual", name: "Farmácia da esquina" })],
		});

		expect(rows[0].isDuplicate).toBe(true);
		expect(rows[0].selected).toBe(false);
		expect(rows[0].duplicateValidation?.existingTransactionId).toBe("manual");
		expect(rows[0].existingAmountCorrection).toBeNull();
	});

	it("propõe a correção de valor quando o arquivo diverge do cadastro", () => {
		const rows = applyInvoiceClosingToReviewRows({
			rows: [
				fileRow({
					amount: 105.9,
					description: "OBA HORTIFRUTI",
					sourceDescription: "OBA HORTIFRUTI",
				}),
			],
			snapshots: [
				snapshot({ id: "oba", name: "Oba Hortifruti", amount: "-100.00" }),
			],
		});

		expect(rows[0].isDuplicate).toBe(true);
		expect(rows[0].existingAmount).toBe(100);
		expect(rows[0].existingAmountCorrection).toEqual({
			transactionId: "oba",
			amount: 105.9,
		});
	});

	it("deixa entrar a linha que não tem cadastro correspondente", () => {
		const rows = applyInvoiceClosingToReviewRows({
			rows: [
				fileRow({ amount: 77, description: "COMPRA NOVA", date: "2026-01-09" }),
			],
			snapshots: [
				snapshot({ id: "outro", name: "Outra coisa", amount: "-999.00" }),
			],
		});

		expect(rows[0].isDuplicate).toBe(false);
		expect(rows[0].selected).toBe(true);
	});

	it("solta o cadastro reivindicado por um casamento anterior que não virou par", () => {
		const stale = fileRow({
			amount: 77,
			description: "COMPRA NOVA",
			date: "2026-01-09",
			isDuplicate: true,
			selected: false,
			duplicateValidation: {
				status: "match",
				matchScore: { date: false, amount: false, description: true },
				mismatches: [],
				existingTransactionId: "outro",
				existingPayerId: null,
				existingCategoryId: null,
			},
		});

		const rows = applyInvoiceClosingToReviewRows({
			rows: [stale],
			snapshots: [
				snapshot({ id: "outro", name: "Outra coisa", amount: "-999.00" }),
			],
		});

		expect(rows[0].isDuplicate).toBe(false);
		expect(rows[0].duplicateValidation).toBeNull();
		expect(rows[0].selected).toBe(true);
	});

	it("respeita vínculo feito à mão", () => {
		const linked = fileRow({
			linked: true,
			linkedTransactionId: "manual",
			selected: false,
		});

		const rows = applyInvoiceClosingToReviewRows({
			rows: [linked],
			snapshots: [snapshot({ id: "manual" })],
		});

		expect(rows[0]).toBe(linked);
	});

	it("não mexe em pagamento de fatura nem em linha de excesso", () => {
		const payment = fileRow({ kind: "invoice_payment", selected: false });
		const extra = fileRow({
			kind: "invoice_extra",
			existingTransactionId: "x",
		});

		const rows = applyInvoiceClosingToReviewRows({
			rows: [payment, extra],
			snapshots: [snapshot({ id: "manual" })],
		});

		expect(rows[0]).toBe(payment);
		expect(rows[1]).toBe(extra);
	});

	it("corrige a linha por um centavo: valor individual acompanha o arquivo", () => {
		const rows = applyInvoiceClosingToReviewRows({
			rows: [
				fileRow({
					amount: 35.51,
					description: "Mercado*Mercadolivre - Parcela 1/5",
					sourceDescription: "Mercado*Mercadolivre - Parcela 1/5",
				}),
			],
			snapshots: [
				snapshot({
					id: "parcela",
					name: "Mercado*Mercadolivre",
					amount: "-35.50",
					currentInstallment: 1,
					installmentCount: 5,
				}),
			],
		});

		expect(rows[0].existingAmountCorrection).toEqual({
			transactionId: "parcela",
			amount: 35.51,
		});
	});

	it("corrige a numeração da parcela cadastrada no mês errado", () => {
		const rows = applyInvoiceClosingToReviewRows({
			rows: [
				fileRow({
					amount: 260,
					description: "Fabio C Thomaziello - Parcela 5/10",
					sourceDescription: "Fabio C Thomaziello - Parcela 5/10",
				}),
			],
			snapshots: [
				snapshot({
					id: "parcela-errada",
					name: "Fabio C Thomaziello",
					amount: "-260.00",
					currentInstallment: 10,
					installmentCount: 10,
				}),
			],
		});

		expect(rows[0].existingInstallmentCorrection).toEqual({
			transactionId: "parcela-errada",
			currentInstallment: 5,
			installmentCount: 10,
		});
		// o dinheiro já batia: nada a corrigir de valor
		expect(rows[0].existingAmountCorrection).toBeNull();
	});

	it("não propõe correção quando a parcela já está certa", () => {
		const rows = applyInvoiceClosingToReviewRows({
			rows: [
				fileRow({
					amount: 260,
					description: "Fabio C Thomaziello - Parcela 5/10",
					sourceDescription: "Fabio C Thomaziello - Parcela 5/10",
				}),
			],
			snapshots: [
				snapshot({
					id: "ok",
					name: "Fabio C Thomaziello",
					amount: "-260.00",
					currentInstallment: 5,
					installmentCount: 10,
				}),
			],
		});

		expect(rows[0].existingInstallmentCorrection).toBeNull();
	});

	it("não põe número de parcela em lançamento à vista", () => {
		const rows = applyInvoiceClosingToReviewRows({
			rows: [
				fileRow({
					amount: 260,
					description: "Fabio C Thomaziello - Parcela 5/10",
					sourceDescription: "Fabio C Thomaziello - Parcela 5/10",
				}),
			],
			snapshots: [
				snapshot({
					id: "avista",
					name: "Fabio C Thomaziello",
					amount: "-260.00",
					currentInstallment: null,
					installmentCount: null,
				}),
			],
		});

		expect(rows[0].existingInstallmentCorrection).toBeNull();
	});

	it("herda categoria e pessoa do cadastro conferido", () => {
		const rows = applyInvoiceClosingToReviewRows({
			rows: [fileRow()],
			snapshots: [snapshot({ id: "manual" })],
		});

		expect(rows[0].categoryId).toBe("cat-1");
		expect(rows[0].payerId).toBe("payer-1");
	});
});

describe("fechamento da fatura de ponta a ponta", () => {
	it("zera a diferença conferindo, ajustando, importando e removendo", () => {
		// Arquivo: 100 (já cadastrado com nome humanizado) + 50 (cadastrado com
		// valor errado) + 150 (ainda não cadastrado) = 300.
		const fileRows = [
			fileRow({
				amount: 100,
				description: "DROGASIL2832",
				sourceDescription: "DROGASIL2832",
				date: "2026-01-05",
			}),
			fileRow({
				amount: 50,
				description: "OBA HORTIFRUTI",
				sourceDescription: "OBA HORTIFRUTI",
				date: "2026-01-06",
			}),
			fileRow({
				amount: 150,
				description: "COMPRA NOVA",
				sourceDescription: "COMPRA NOVA",
				date: "2026-01-07",
			}),
		];

		const snapshots = [
			snapshot({
				id: "humanizado",
				name: "Farmácia da esquina",
				amount: "-100.00",
				purchaseDate: "2026-01-05",
			}),
			snapshot({
				id: "valor-errado",
				name: "Oba Hortifruti",
				amount: "-45.00",
				purchaseDate: "2026-01-06",
			}),
			snapshot({
				id: "sobrando",
				name: "Compra que não está na fatura",
				amount: "-80.00",
				purchaseDate: "2026-01-02",
			}),
		];

		const closed = applyInvoiceClosingToReviewRows({
			rows: fileRows,
			snapshots,
		});
		const merged = mergeInvoiceReviewRowsWithExtras({
			fileRows: closed,
			snapshots,
			fileExternalIds: [],
		});

		expect(closed[0].isDuplicate).toBe(true);
		expect(closed[0].existingAmountCorrection).toBeNull();
		expect(closed[1].existingAmountCorrection).toEqual({
			transactionId: "valor-errado",
			amount: 50,
		});
		expect(closed[2].selected).toBe(true);

		const extras = merged.filter(isInvoiceExtraReviewRow);
		expect(extras.map((row) => row.existingTransactionId)).toEqual([
			"sobrando",
		]);
		expect(extras[0].selected).toBe(true);

		const reconciliation = computeImportReconciliation({
			sourceTotal: 300,
			reviewRows: merged.map(mapReviewRowToReconciliationRow),
			existingRows: applyExistingAmountEdits(
				snapshots.map(mapDuplicateSnapshotToExistingRow),
				collectExistingAmountEdits(merged),
			),
			fileExternalIds: [],
		});

		expect(reconciliation.delta).toBe(0);
	});
});
