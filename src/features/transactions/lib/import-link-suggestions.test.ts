import { describe, expect, it } from "vitest";
import { buildImportDuplicateValidation } from "./import-duplicate-match";
import {
	canAutoLinkImportSuggestion,
	collectImportLinkSuggestionIndexes,
	resolveAutoLinkMergeDescription,
} from "./import-link-suggestions";

describe("canAutoLinkImportSuggestion", () => {
	it("permite auto-vínculo quando data e valor batem e só a descrição diverge", () => {
		const validation = buildImportDuplicateValidation(
			{
				date: "2026-07-05",
				amount: 50.96,
				description: "Compra no débito CARREFOUR CPS 05",
				transactionType: "expense",
			},
			{
				id: "existing-1",
				ofxFitId: null,
				name: "Carrefour",
				amount: "-50.96",
				purchaseDate: new Date(2026, 6, 5),
				transactionType: "Despesa",
				currentInstallment: null,
				installmentCount: null,
				payerId: "payer-1",
				categoryId: "cat-1",
			},
		);

		expect(validation.status).toBe("link_suggestion");
		expect(canAutoLinkImportSuggestion(validation)).toBe(true);
		expect(resolveAutoLinkMergeDescription(validation)).toBe("import");
	});

	it("bloqueia auto-vínculo quando o valor diverge", () => {
		const validation = buildImportDuplicateValidation(
			{
				date: "2026-07-05",
				amount: 50.96,
				description: "Compra no débito CARREFOUR CPS 05",
				transactionType: "expense",
			},
			{
				id: "existing-1",
				ofxFitId: null,
				name: "Compra no débito CARREFOUR CPS 05",
				amount: "-60.00",
				purchaseDate: new Date(2026, 6, 5),
				transactionType: "Despesa",
				currentInstallment: null,
				installmentCount: null,
				payerId: "payer-1",
				categoryId: "cat-1",
			},
		);

		expect(canAutoLinkImportSuggestion(validation)).toBe(false);
	});
});

describe("collectImportLinkSuggestionIndexes", () => {
	it("retorna apenas sugestões elegíveis ao auto-vínculo", () => {
		const rows = [
			{
				duplicateValidation: buildImportDuplicateValidation(
					{
						date: "2026-07-05",
						amount: 50.96,
						description: "Compra no débito CARREFOUR CPS 05",
						transactionType: "expense",
					},
					{
						id: "existing-1",
						ofxFitId: null,
						name: "Carrefour",
						amount: "-50.96",
						purchaseDate: new Date(2026, 6, 5),
						transactionType: "Despesa",
						currentInstallment: null,
						installmentCount: null,
						payerId: "payer-1",
						categoryId: "cat-1",
					},
				),
			},
			{
				duplicateValidation: buildImportDuplicateValidation(
					{
						date: "2026-07-05",
						amount: 50.96,
						description: "Outra descrição",
						transactionType: "expense",
					},
					{
						id: "existing-2",
						ofxFitId: null,
						name: "Outra descrição",
						amount: "-60.00",
						purchaseDate: new Date(2026, 6, 5),
						transactionType: "Despesa",
						currentInstallment: null,
						installmentCount: null,
						payerId: "payer-1",
						categoryId: "cat-1",
					},
				),
			},
		] as Parameters<typeof collectImportLinkSuggestionIndexes>[0];

		expect(collectImportLinkSuggestionIndexes(rows)).toEqual([0, 1]);
		expect(
			collectImportLinkSuggestionIndexes(rows, { autoLinkOnly: true }),
		).toEqual([0]);
	});
});
