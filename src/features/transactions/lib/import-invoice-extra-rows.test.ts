import { describe, expect, it } from "vitest";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import type { ImportDuplicateSnapshot } from "@/features/transactions/lib/import-duplicate-match";
import {
	buildInvoiceExtraReviewRows,
	collectMatchedExistingTransactionIdsFromReviewRows,
	mergeInvoiceReviewRowsWithExtras,
} from "@/features/transactions/lib/import-invoice-extra-rows";

function snapshot(
	overrides: Partial<ImportDuplicateSnapshot> &
		Pick<ImportDuplicateSnapshot, "id">,
): ImportDuplicateSnapshot {
	return {
		ofxFitId: null,
		name: "Compra teste",
		amount: "10.00",
		purchaseDate: "2026-07-10",
		transactionType: "Despesa",
		currentInstallment: null,
		installmentCount: null,
		payerId: "11111111-1111-4111-8111-111111111111",
		categoryId: "22222222-2222-4222-8222-222222222222",
		...overrides,
	};
}

function fileRow(
	overrides: Partial<ReviewRow> & Pick<ReviewRow, "reviewKey">,
): ReviewRow {
	return {
		externalId: null,
		date: "2026-07-10",
		amount: 10,
		description: "Compra teste",
		sourceDescription: "Compra teste",
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
		existingTransactionId: null,
		...overrides,
	};
}

describe("import-invoice-extra-rows", () => {
	it("cria linha extra para cadastro sem correspondência no arquivo", () => {
		const extras = buildInvoiceExtraReviewRows({
			snapshots: [snapshot({ id: "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })],
			fileRows: [
				fileRow({
					reviewKey: "file-1",
					description: "Outra compra",
					sourceDescription: "Outra compra",
					amount: 50,
				}),
			],
			fileExternalIds: [],
		});

		expect(extras).toHaveLength(1);
		expect(extras[0]?.kind).toBe("invoice_extra");
		expect(extras[0]?.invoiceExtraReason).toBe("not_in_file");
		expect(extras[0]?.selected).toBe(true);
		expect(extras[0]?.existingTransactionId).toBe(
			"aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		);
	});

	it("marca extra como duplicata quando nome e valor batem com o arquivo", () => {
		const extras = buildInvoiceExtraReviewRows({
			snapshots: [
				snapshot({
					id: "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
					name: "Fabio C Thomaziello",
					amount: "260.00",
				}),
			],
			fileRows: [
				fileRow({
					reviewKey: "file-1",
					description: "Fabio C Thomaziello - Parcela 5/10",
					sourceDescription: "Fabio C Thomaziello - Parcela 5/10",
					amount: 260,
					isDuplicate: true,
					selected: false,
					duplicateValidation: {
						status: "match",
						matchScore: { date: true, amount: true, description: true },
						mismatches: [],
						existingTransactionId: "bbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
						existingPayerId: null,
						existingCategoryId: null,
					},
				}),
			],
			fileExternalIds: [],
		});

		expect(extras).toHaveLength(1);
		expect(extras[0]?.invoiceExtraReason).toBe("duplicate");
	});

	it("não cria extra quando o cadastro já foi conferido no arquivo", () => {
		const matchedId = "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const extras = buildInvoiceExtraReviewRows({
			snapshots: [snapshot({ id: matchedId })],
			fileRows: [
				fileRow({
					reviewKey: "file-1",
					isDuplicate: true,
					selected: false,
					duplicateValidation: {
						status: "match",
						matchScore: { date: true, amount: true, description: true },
						mismatches: [],
						existingTransactionId: matchedId,
						existingPayerId: null,
						existingCategoryId: null,
					},
				}),
			],
			fileExternalIds: [],
		});

		expect(extras).toHaveLength(0);
		expect(
			collectMatchedExistingTransactionIdsFromReviewRows([
				fileRow({
					reviewKey: "file-1",
					isDuplicate: true,
					duplicateValidation: {
						status: "match",
						matchScore: { date: true, amount: true, description: true },
						mismatches: [],
						existingTransactionId: matchedId,
						existingPayerId: null,
						existingCategoryId: null,
					},
				}),
			]),
		).toEqual(new Set([matchedId]));
	});

	it("preserva seleção anterior ao remontar extras", () => {
		const existingId = "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const previousExtra = buildInvoiceExtraReviewRows({
			snapshots: [snapshot({ id: existingId })],
			fileRows: [],
			fileExternalIds: [],
		})[0];

		const merged = mergeInvoiceReviewRowsWithExtras({
			fileRows: [fileRow({ reviewKey: "file-1" })],
			snapshots: [snapshot({ id: existingId })],
			fileExternalIds: [],
			previousRows: [{ ...previousExtra, selected: false }],
		});

		const extra = merged.find((row) => row.kind === "invoice_extra");
		expect(extra?.selected).toBe(false);
	});
});
