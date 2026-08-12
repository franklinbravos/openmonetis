import { describe, expect, it } from "vitest";
import {
	buildImportDuplicateValidation,
	findInstallmentDuplicateSnapshot,
	mergeImportDuplicateSnapshots,
	resolveSemanticImportMatches,
	scoreImportAgainstSnapshot,
} from "./import-duplicate-match";

const existingInstallment = {
	id: "existing-4",
	ofxFitId: null,
	name: "Fabio C Thomaziello",
	amount: "-260.00",
	purchaseDate: new Date(2026, 9, 5), // compra original da série
	transactionType: "Despesa",
	currentInstallment: 4,
	installmentCount: 10,
	payerId: "payer-1",
	categoryId: "cat-1",
};

describe("scoreImportAgainstSnapshot — parcelamento", () => {
	it("não exige data igual: nome+parcela+valor bastam para match efetivo", () => {
		const row = {
			date: "2026-12-05",
			amount: 260,
			description: "Fabio C Thomaziello - Parcela 4/10",
			transactionType: "expense" as const,
			installmentImport: {
				enabled: true as const,
				name: "Fabio C Thomaziello",
				currentInstallment: 4,
				installmentCount: 10,
			},
		};

		const score = scoreImportAgainstSnapshot(row, existingInstallment);

		expect(score).toEqual({
			date: false,
			amount: true,
			description: true,
		});

		const validation = buildImportDuplicateValidation(row, existingInstallment);
		expect(validation.status).toBe("match");
	});

	it("não ignora data quando a parcela é outra", () => {
		const score = scoreImportAgainstSnapshot(
			{
				date: "2026-12-05",
				amount: 260,
				description: "Fabio C Thomaziello - Parcela 5/10",
				transactionType: "expense",
				installmentImport: {
					enabled: true,
					name: "Fabio C Thomaziello",
					currentInstallment: 5,
					installmentCount: 10,
				},
			},
			existingInstallment,
		);

		expect(score.date).toBe(false);
		expect(score.amount).toBe(true);
		expect(score.description).toBe(false);
	});
});

describe("buildImportDuplicateValidation — parcelamento", () => {
	it("retorna match sem reportar divergência de data entre faturas", () => {
		const validation = buildImportDuplicateValidation(
			{
				date: "2026-12-05",
				amount: 260,
				description: "Fabio C Thomaziello - Parcela 4/10",
				transactionType: "expense",
				installmentImport: {
					enabled: true,
					name: "Fabio C Thomaziello",
					currentInstallment: 4,
					installmentCount: 10,
				},
			},
			existingInstallment,
		);

		expect(validation.status).toBe("match");
		expect(validation.mismatches).toEqual([]);
	});

	it("reconhece cadastro à vista na fatura (nome sem parcela no banco)", () => {
		const validation = buildImportDuplicateValidation(
			{
				date: "2027-01-05",
				amount: 260,
				description: "Fabio C Thomaziello - Parcela 4/10",
				transactionType: "expense",
				installmentImport: {
					enabled: true,
					name: "Fabio C Thomaziello",
					currentInstallment: 4,
					installmentCount: 10,
				},
			},
			{
				...existingInstallment,
				name: "Fabio C Thomaziello",
				currentInstallment: null,
				installmentCount: null,
			},
		);

		expect(validation.status).toBe("match");
	});
});

describe("mergeImportDuplicateSnapshots", () => {
	it("deduplica candidatos pelo id", () => {
		const merged = mergeImportDuplicateSnapshots(
			[existingInstallment],
			[existingInstallment],
		);

		expect(merged).toHaveLength(1);
		expect(merged[0]?.id).toBe("existing-4");
	});
});

describe("findInstallmentDuplicateSnapshot", () => {
	it("encontra parcela 4/10 cadastrada na fatura com campos de parcelamento", () => {
		const row = {
			date: "2026-12-05",
			amount: 260,
			description: "Fabio C Thomaziello - Parcela 4/10",
			transactionType: "expense" as const,
			installmentImport: {
				enabled: true as const,
				name: "Fabio C Thomaziello",
				currentInstallment: 4,
				installmentCount: 10,
			},
		};

		expect(
			findInstallmentDuplicateSnapshot(row, [existingInstallment])?.id,
		).toBe("existing-4");
	});

	it("reconhece lançamento manual na mesma fatura com parcela divergente", () => {
		const row = {
			date: "2026-12-05",
			amount: 260,
			description: "Fabio C Thomaziello - Parcela 4/10",
			transactionType: "expense" as const,
			installmentImport: {
				enabled: true as const,
				name: "Fabio C Thomaziello",
				currentInstallment: 4,
				installmentCount: 10,
			},
		};

		expect(
			findInstallmentDuplicateSnapshot(
				row,
				[
					{
						...existingInstallment,
						id: "existing-manual",
						currentInstallment: 1,
						installmentCount: 10,
						period: "2026-12",
					},
				],
				{ invoicePeriods: ["2026-12"] },
			)?.id,
		).toBe("existing-manual");
	});
});

describe("resolveSemanticImportMatches — parcelamento", () => {
	it("resolve parcela do extrato contra a série já cadastrada", () => {
		const matches = resolveSemanticImportMatches(
			[
				{
					date: "2026-12-05",
					amount: 260,
					description: "Fabio C Thomaziello - Parcela 4/10",
					transactionType: "expense",
					installmentImport: {
						enabled: true,
						name: "Fabio C Thomaziello",
						currentInstallment: 4,
						installmentCount: 10,
					},
				},
			],
			[existingInstallment],
		);

		expect(matches.get(0)?.validation.status).toBe("match");
		expect(matches.get(0)?.existing.id).toBe("existing-4");
	});

	it("resolve parcela cadastrada à vista na fatura de janeiro", () => {
		const matches = resolveSemanticImportMatches(
			[
				{
					date: "2026-12-05",
					amount: 260,
					description: "Fabio C Thomaziello - Parcela 4/10",
					transactionType: "expense",
					installmentImport: {
						enabled: true,
						name: "Fabio C Thomaziello",
						currentInstallment: 4,
						installmentCount: 10,
					},
				},
			],
			[
				{
					...existingInstallment,
					id: "existing-jan",
					name: "Fabio C Thomaziello",
					currentInstallment: null,
					installmentCount: null,
					purchaseDate: new Date(2027, 0, 5),
				},
			],
		);

		expect(matches.get(0)?.validation.status).toBe("match");
		expect(matches.get(0)?.existing.id).toBe("existing-jan");
	});

	it("marca duas linhas iguais do arquivo contra o mesmo cadastro", () => {
		const row = {
			date: "2026-12-05",
			amount: 260,
			description: "Fabio C Thomaziello - Parcela 4/10",
			transactionType: "expense" as const,
			installmentImport: {
				enabled: true as const,
				name: "Fabio C Thomaziello",
				currentInstallment: 4,
				installmentCount: 10,
			},
		};

		const matches = resolveSemanticImportMatches(
			[row, row],
			[existingInstallment],
		);

		expect(matches.get(0)?.validation.status).toBe("match");
		expect(matches.get(1)?.validation.status).toBe("match");
	});
});
