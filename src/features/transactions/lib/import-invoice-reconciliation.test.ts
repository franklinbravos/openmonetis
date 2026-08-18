import { describe, expect, it } from "vitest";
import type { ReviewRow } from "@/features/transactions/components/import/review-table";
import type { ImportDuplicateSnapshot } from "@/features/transactions/lib/import-duplicate-match";
import {
	buildInvoicePeriodExistingIdSet,
	collectCrossPeriodReviewRows,
	collectCrossPeriodReviewStats,
	isImportRowCrossPeriod,
	sumSignedAmountForCrossPeriodRows,
} from "@/features/transactions/lib/import-invoice-reconciliation";

function snapshot(id: string, period: string): ImportDuplicateSnapshot {
	return {
		id,
		ofxFitId: null,
		name: "Compra teste",
		amount: "10.00",
		purchaseDate: "2026-07-10",
		transactionType: "Despesa",
		currentInstallment: null,
		installmentCount: null,
		payerId: null,
		categoryId: null,
		period,
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

function matchedValidation(id: string) {
	return {
		status: "match" as const,
		matchScore: { date: true, amount: true, description: true },
		mismatches: [],
		existingTransactionId: id,
		existingPayerId: null,
		existingCategoryId: null,
	};
}

const PERIOD_ID = "period-transaction";
const OTHER_PERIOD_ID = "other-period-transaction";

describe("buildInvoicePeriodExistingIdSet", () => {
	it("coleta os ids do período reconciliado", () => {
		const set = buildInvoicePeriodExistingIdSet([
			snapshot(PERIOD_ID, "2026-07"),
			snapshot(OTHER_PERIOD_ID, "2026-06"),
		]);

		expect(set.has(PERIOD_ID)).toBe(true);
		expect(set.has(OTHER_PERIOD_ID)).toBe(true);
	});
});

describe("isImportRowCrossPeriod", () => {
	const idSet = buildInvoicePeriodExistingIdSet([
		snapshot(PERIOD_ID, "2026-07"),
	]);

	it("retorna false para linha pendente (não conferida nem vinculada)", () => {
		const row = fileRow({
			reviewKey: "pending",
			selected: true,
			isDuplicate: false,
			duplicateValidation: null,
		});

		expect(isImportRowCrossPeriod(row, idSet)).toBe(false);
	});

	it("retorna false para duplicata conferida no período reconciliado", () => {
		const row = fileRow({
			reviewKey: "in-period",
			isDuplicate: true,
			selected: false,
			duplicateValidation: matchedValidation(PERIOD_ID),
		});

		expect(isImportRowCrossPeriod(row, idSet)).toBe(false);
	});

	it("retorna true para duplicata conferida cujo lançamento está em outro período", () => {
		const row = fileRow({
			reviewKey: "cross-period",
			isDuplicate: true,
			selected: false,
			duplicateValidation: matchedValidation(OTHER_PERIOD_ID),
		});

		expect(isImportRowCrossPeriod(row, idSet)).toBe(true);
	});

	it("retorna true para linha vinculada a lançamento de outro período", () => {
		const row = fileRow({
			reviewKey: "linked-cross",
			isDuplicate: false,
			selected: false,
			linked: true,
			linkedTransactionId: OTHER_PERIOD_ID,
		});

		expect(isImportRowCrossPeriod(row, idSet)).toBe(true);
	});

	it("retorna false quando o conjunto do período está ausente", () => {
		const row = fileRow({
			reviewKey: "no-set",
			isDuplicate: true,
			selected: false,
			duplicateValidation: matchedValidation(OTHER_PERIOD_ID),
		});

		expect(isImportRowCrossPeriod(row, new Set())).toBe(true);
	});
});

describe("collectCrossPeriodReviewRows", () => {
	it("seleciona apenas conferidas/vinculadas de outro período", () => {
		const idSet = buildInvoicePeriodExistingIdSet([
			snapshot(PERIOD_ID, "2026-07"),
		]);
		const rows = [
			fileRow({
				reviewKey: "in-period",
				isDuplicate: true,
				selected: false,
				duplicateValidation: matchedValidation(PERIOD_ID),
			}),
			fileRow({
				reviewKey: "cross-period",
				isDuplicate: true,
				selected: false,
				duplicateValidation: matchedValidation(OTHER_PERIOD_ID),
			}),
			fileRow({
				reviewKey: "pending",
				selected: true,
				isDuplicate: false,
				duplicateValidation: null,
			}),
		];

		const crossPeriod = collectCrossPeriodReviewRows(rows, idSet);

		expect(crossPeriod).toHaveLength(1);
		expect(crossPeriod[0]?.reviewKey).toBe("cross-period");
	});
});

describe("sumSignedAmountForCrossPeriodRows", () => {
	it("soma valores assinados pelo tipo da linha", () => {
		const total = sumSignedAmountForCrossPeriodRows([
			fileRow({ reviewKey: "a", amount: 100 }),
			fileRow({
				reviewKey: "b",
				amount: 50,
				transactionType: "income",
			}),
		]);

		expect(total).toBe(-50);
	});
});

describe("collectCrossPeriodReviewStats", () => {
	it("computa contagem e total exibível das linhas de outro período", () => {
		const idSet = buildInvoicePeriodExistingIdSet([
			snapshot(PERIOD_ID, "2026-07"),
		]);
		const rows = [
			fileRow({
				reviewKey: "cross-1",
				amount: 100,
				isDuplicate: true,
				selected: false,
				duplicateValidation: matchedValidation(OTHER_PERIOD_ID),
			}),
			fileRow({
				reviewKey: "cross-2",
				amount: 192.19,
				isDuplicate: true,
				selected: false,
				duplicateValidation: matchedValidation("outro-id"),
			}),
			fileRow({
				reviewKey: "in-period",
				amount: 200,
				isDuplicate: true,
				selected: false,
				duplicateValidation: matchedValidation(PERIOD_ID),
			}),
		];

		const stats = collectCrossPeriodReviewStats(rows, idSet);

		expect(stats.count).toBe(2);
		expect(stats.displayTotal).toBe(292.19);
	});
});
