import { describe, expect, it } from "vitest";
import { buildCategoryReportData } from "./category-report-queries";

describe("buildCategoryReportData", () => {
	it("monta categorias com totais por período e variação percentual", () => {
		const result = buildCategoryReportData(
			[
				{
					categoryId: "cat-1",
					categoryName: "Alimentação",
					categoryIcon: "lucide-utensils",
					categoryType: "despesa",
					period: "2025-01",
					total: "-120.50",
				},
				{
					categoryId: "cat-1",
					categoryName: "Alimentação",
					categoryIcon: "lucide-utensils",
					categoryType: "despesa",
					period: "2025-02",
					total: "-150.00",
				},
				{
					categoryId: "cat-2",
					categoryName: "Salário",
					categoryIcon: "lucide-wallet",
					categoryType: "receita",
					period: "2025-01",
					total: "3500",
				},
			],
			["2025-01", "2025-02"],
		);

		expect(result.grandTotal).toBe(120.5 + 150 + 3500);
		expect(result.totals.get("2025-01")).toBe(120.5 + 3500);
		expect(result.totals.get("2025-02")).toBe(150);
		expect(result.categories).toHaveLength(2);

		const food = result.categories.find(
			(category) => category.categoryId === "cat-1",
		);
		expect(food?.monthlyData.get("2025-01")?.amount).toBe(120.5);
		expect(food?.monthlyData.get("2025-02")?.previousAmount).toBe(120.5);
		expect(food?.monthlyData.get("2025-02")?.percentageChange).toBeCloseTo(
			((150 - 120.5) / 120.5) * 100,
		);

		// Sort: despesa antes de receita, totais decrescentes
		expect(result.categories[0]?.categoryId).toBe("cat-1");
		expect(result.categories[1]?.categoryId).toBe("cat-2");
	});

	it("retorna estrutura vazia com períodos zerados quando não há linhas", () => {
		const result = buildCategoryReportData([], ["2025-01", "2025-02"]);

		expect(result.categories).toEqual([]);
		expect(result.grandTotal).toBe(0);
		expect(result.totals.get("2025-01")).toBe(0);
		expect(result.totals.get("2025-02")).toBe(0);
	});

	it("trata total ausente/inválido como zero e preenche períodos sem dados", () => {
		const result = buildCategoryReportData(
			[
				{
					categoryId: "cat-1",
					categoryName: "Alimentação",
					categoryIcon: null,
					categoryType: "despesa",
					period: "2025-01",
					total: null,
				},
				{
					categoryId: "cat-1",
					categoryName: "Alimentação",
					categoryIcon: null,
					categoryType: "despesa",
					period: "2025-02",
					total: "abc",
				},
			],
			["2025-01", "2025-02"],
		);

		const food = result.categories[0];
		expect(food?.monthlyData.get("2025-01")?.amount).toBe(0);
		expect(food?.monthlyData.get("2025-02")?.amount).toBe(0);
		expect(food?.monthlyData.get("2025-02")?.previousAmount).toBe(0);
		expect(food?.monthlyData.get("2025-02")?.percentageChange).toBeNull();
		expect(result.grandTotal).toBe(0);
		expect(result.totals.get("2025-01")).toBe(0);
	});
});
