import { describe, expect, it } from "vitest";
import { buildEstablishments } from "./queries";

describe("buildEstablishments", () => {
	it("constrói estabelecimentos preservando a ordem do ranking (contagem desc) e agrega categorias", () => {
		const categoryMap = new Map([
			["cat-1", { id: "cat-1", name: "Alimentação", icon: null }],
			["cat-2", { id: "cat-2", name: "Transporte", icon: null }],
			["cat-3", { id: "cat-3", name: "Lazer", icon: null }],
			["cat-4", { id: "cat-4", name: "Saúde", icon: null }],
		]);

		const establishments = buildEstablishments(
			[
				{ name: "Padaria", count: 5, total_amount: "-150.50" },
				{ name: "Mercado", count: 3, total_amount: "-200" },
				{ name: "Farmácia", count: 1, total_amount: "-40" },
			],
			[
				{ establishment_name: "Padaria", category_id: "cat-1", count: 3 },
				{ establishment_name: "Padaria", category_id: "cat-2", count: 1 },
				{ establishment_name: "Padaria", category_id: "cat-3", count: 1 },
				{ establishment_name: "Mercado", category_id: "cat-1", count: 3 },
			],
			categoryMap,
		);

		expect(establishments.map((est) => est.name)).toEqual([
			"Padaria",
			"Mercado",
			"Farmácia",
		]);
		expect(establishments[0]).toMatchObject({
			count: 5,
			totalAmount: 150.5,
			avgAmount: 30.1,
			categories: [
				{ name: "Alimentação", count: 3 },
				{ name: "Transporte", count: 1 },
				{ name: "Lazer", count: 1 },
			],
		});
		expect(establishments[1].categories).toEqual([
			{ name: "Alimentação", count: 3 },
		]);
		expect(establishments[2].categories).toEqual([]);
	});

	it("ignora linhas de categoria com estabelecimento ou categoria nulos", () => {
		const categoryMap = new Map([
			["cat-1", { id: "cat-1", name: "Alimentação", icon: null }],
		]);

		const establishments = buildEstablishments(
			[{ name: "Padaria", count: 2, total_amount: "-100" }],
			[
				{ establishment_name: null, category_id: "cat-1", count: 1 },
				{ establishment_name: "Padaria", category_id: null, count: 1 },
				{ establishment_name: "Padaria", category_id: "cat-1", count: 1 },
			],
			categoryMap,
		);

		expect(establishments[0].categories).toEqual([
			{ name: "Alimentação", count: 1 },
		]);
	});

	it("usa fallback quando contagem é zero ou categorias não existem no mapa", () => {
		const categoryMap = new Map<
			string,
			{ id: string; name: string; icon: null }
		>([]);

		const establishments = buildEstablishments(
			[{ name: "Casa de câmbio", count: 0, total_amount: "0" }],
			[
				{
					establishment_name: "Casa de câmbio",
					category_id: "cat-x",
					count: 1,
				},
			],
			categoryMap,
		);

		expect(establishments[0]).toMatchObject({
			count: 0,
			totalAmount: 0,
			avgAmount: 0,
			categories: [{ name: "Sem categoria", count: 1 }],
		});
	});
});
