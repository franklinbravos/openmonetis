import { describe, expect, it } from "vitest";
import {
	buildImportReviewFilteredEntries,
	type ImportReviewFilterableRow,
	matchesImportReviewSearch,
	matchesImportReviewStatusFilter,
} from "./import-review-filters";

function createRow(
	overrides: Partial<ImportReviewFilterableRow> = {},
): ImportReviewFilterableRow {
	return {
		selected: true,
		description: "Mercado Livre",
		sourceDescription: "Mercado Livre",
		date: "2025-12-05",
		amount: 87.95,
		transactionType: "expense",
		kind: "transaction",
		categoryId: "cat-1",
		payerId: "payer-1",
		isDuplicate: false,
		duplicateValidation: null,
		invoicePaymentCardId: null,
		invoicePaymentPeriod: null,
		transferPeerAccountId: null,
		installmentImport: null,
		recurrenceImport: null,
		...overrides,
	};
}

describe("import-review-filters", () => {
	it("filtra busca por descrição e valor", () => {
		const row = createRow();

		expect(matchesImportReviewSearch(row, "mercado")).toBe(true);
		expect(matchesImportReviewSearch(row, "87,95")).toBe(true);
		expect(matchesImportReviewSearch(row, "amazon")).toBe(false);
	});

	it("filtra status sem categoria apenas em lançamentos selecionados", () => {
		const uncategorized = createRow({ categoryId: null });
		const excluded = createRow({ categoryId: null, selected: false });

		expect(
			matchesImportReviewStatusFilter(uncategorized, "uncategorized"),
		).toBe(true);
		expect(matchesImportReviewStatusFilter(excluded, "uncategorized")).toBe(
			false,
		);
	});

	it("preserva índices originais ao montar entradas filtradas", () => {
		const rows = [
			createRow({ description: "A" }),
			createRow({ description: "B", categoryId: null }),
			createRow({ description: "C" }),
		];

		const filtered = buildImportReviewFilteredEntries(
			rows,
			"b",
			"uncategorized",
		);

		expect(filtered).toEqual([{ row: rows[1], index: 1 }]);
	});
});
