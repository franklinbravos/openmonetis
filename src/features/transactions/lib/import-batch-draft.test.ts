import { describe, expect, it } from "vitest";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import {
	applyImportBatchDraftToRows,
	buildImportBatchDraft,
	buildImportReviewRowKey,
	type ImportBatchDraftData,
} from "@/features/transactions/lib/import-batch-draft";

function keylessRow(
	overrides: Partial<ReviewRow> & Pick<ReviewRow, "reviewKey">,
): ReviewRow {
	return {
		externalId: null,
		date: "2026-02-10",
		amount: 14.86,
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

function preEditKey(amount: number): string {
	return buildImportReviewRowKey({
		externalId: null,
		date: "2026-02-10",
		amount,
		description: "Compra teste",
	});
}

function baseDraftInput(
	rows: ReviewRow[],
): Parameters<typeof buildImportBatchDraft>[0] {
	return {
		payerId: null,
		accountCardValue: null,
		invoicePeriod: null,
		paymentAccountId: null,
		paymentDate: "2026-02-10",
		rows,
	};
}

describe("import-batch-draft: round-trip de amount editado (W2)", () => {
	it("preserva o amount editado de linha keyless casando por originalKey", () => {
		const originalKey = preEditKey(14.86);
		const editedRow = keylessRow({
			reviewKey: "edited-1",
			amount: 14.85,
			originalDraftKey: originalKey,
		});

		const draftData = buildImportBatchDraft(baseDraftInput([editedRow]));

		expect(draftData.rows[0]?.key).toBe(originalKey);
		expect(draftData.rows[0]?.originalKey).toBe(originalKey);
		expect(draftData.rows[0]?.amount).toBe(14.85);

		const reparsedRows = [
			keylessRow({
				reviewKey: "reparsed-1",
				originalDraftKey: originalKey,
			}),
		];
		const applied = applyImportBatchDraftToRows(reparsedRows, draftData);

		expect(applied[0]?.amount).toBe(14.85);
		expect(applied[0]?.originalDraftKey).toBe(originalKey);
	});

	it("preserva existingAmountCorrection no round-trip", () => {
		const editedRow = keylessRow({
			reviewKey: "edited-1",
			amount: 14.86,
			kind: "invoice_extra",
			existingTransactionId: "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			existingAmount: 14.86,
			selected: false,
			originalDraftKey: "existing:aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			existingAmountCorrection: {
				transactionId: "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
				amount: 14.85,
			},
		});

		const draftData = buildImportBatchDraft(baseDraftInput([editedRow]));

		expect(draftData.rows[0]?.existingAmountCorrection).toEqual({
			transactionId: "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			amount: 14.85,
		});

		const reparsedRows = [
			keylessRow({
				reviewKey: "reparsed-1",
				kind: "invoice_extra",
				existingTransactionId: "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
				existingAmount: 14.86,
				selected: false,
			}),
		];
		const applied = applyImportBatchDraftToRows(reparsedRows, draftData);

		expect(applied[0]?.existingAmountCorrection).toEqual({
			transactionId: "aaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
			amount: 14.85,
		});
	});

	it("casa draft antigo sem originalKey pela chave derivada", () => {
		const originalKey = preEditKey(14.86);
		const oldDraft: ImportBatchDraftData = {
			version: 1,
			payerId: null,
			accountCardValue: null,
			invoicePeriod: null,
			paymentAccountId: null,
			paymentDate: "2026-02-10",
			rows: [
				{
					key: originalKey,
					selected: false,
					categoryId: null,
					payerId: null,
					kind: "transaction",
					existingTransactionId: null,
					invoicePaymentCardId: null,
					invoicePaymentPeriod: null,
					transferPeerAccountId: null,
					installmentImport: null,
					recurrenceImport: null,
				},
			],
		};

		const reparsedRows = [keylessRow({ reviewKey: "reparsed-1" })];

		const applied = applyImportBatchDraftToRows(reparsedRows, oldDraft);

		expect(applied[0]?.selected).toBe(false);
		expect(applied[0]?.amount).toBe(14.86);
	});

	it("mantém chaves distintas para linhas keyless do mesmo dia e descrição", () => {
		const rowA = keylessRow({
			reviewKey: "a",
			amount: 14.85,
			originalDraftKey: preEditKey(14.86),
		});
		const rowB = keylessRow({
			reviewKey: "b",
			amount: 9.9,
			originalDraftKey: preEditKey(9.9),
		});

		const draftData = buildImportBatchDraft(baseDraftInput([rowA, rowB]));

		expect(draftData.rows[0]?.key).not.toBe(draftData.rows[1]?.key);
		expect(draftData.rows[0]?.key).toBe(preEditKey(14.86));
		expect(draftData.rows[1]?.key).toBe(preEditKey(9.9));

		const reparsedRows = [
			keylessRow({
				reviewKey: "a-2",
				amount: 14.86,
				originalDraftKey: preEditKey(14.86),
			}),
			keylessRow({
				reviewKey: "b-2",
				amount: 9.9,
				originalDraftKey: preEditKey(9.9),
			}),
		];
		const applied = applyImportBatchDraftToRows(reparsedRows, draftData);

		expect(applied[0]?.amount).toBe(14.85);
		expect(applied[1]?.amount).toBe(9.9);
	});
});
