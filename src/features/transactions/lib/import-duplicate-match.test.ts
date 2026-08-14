import { describe, expect, it } from "vitest";
import {
	buildImportDuplicateValidation,
	collectImportLinkedExistingTransactionIds,
	findInstallmentDuplicateSnapshot,
	mergeImportDuplicateSnapshots,
	resolveImportDuplicateMatches,
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

describe("resolveImportDuplicateMatches — vínculo e FITID", () => {
	const existingPix = {
		id: "existing-pix",
		ofxFitId: "pix-fitid",
		name: "Rava Clinic",
		amount: "500.00",
		purchaseDate: new Date(2026, 0, 15),
		transactionType: "Receita",
		currentInstallment: null,
		installmentCount: null,
		payerId: "payer-1",
		categoryId: "cat-1",
	};

	const importRow = {
		date: "2026-01-15",
		amount: 500,
		description:
			"Transferência recebida pelo Pix - Rava Clinic Estetica E Spa Ltda",
		transactionType: "income" as const,
		externalId: "pix-fitid",
	};

	it("FITID já cadastrado vira duplicata verificada, não possível vínculo", () => {
		const [state] = resolveImportDuplicateMatches([importRow], {
			candidates: [existingPix],
			fitIdDuplicateIds: new Set(["pix-fitid"]),
			duplicateSnapshotByFitId: new Map([["pix-fitid", existingPix]]),
		});

		expect(state.isDuplicate).toBe(true);
		expect(state.duplicateValidation?.status).toBe("match");
	});

	it("não sugere vínculo para lançamento já vinculado na revisão", () => {
		const [state] = resolveImportDuplicateMatches(
			[
				{
					...importRow,
					externalId: null,
					linked: true,
					linkedTransactionId: "existing-pix",
				},
			],
			{
				candidates: [existingPix],
				fitIdDuplicateIds: new Set(),
				duplicateSnapshotByFitId: new Map(),
			},
		);

		expect(state).toEqual({
			isDuplicate: false,
			duplicateValidation: null,
		});
	});

	it("não sugere o mesmo cadastro para outra linha após vínculo", () => {
		const linkedRow = {
			...importRow,
			description: `${importRow.description} (linha 1)`,
			linked: true,
			linkedTransactionId: "existing-pix",
		};
		const pendingRow = {
			...importRow,
			description: `${importRow.description} (linha 2)`,
			externalId: "pix-fitid#2",
		};

		const states = resolveImportDuplicateMatches([linkedRow, pendingRow], {
			candidates: [existingPix],
			fitIdDuplicateIds: new Set(),
			duplicateSnapshotByFitId: new Map(),
		});

		expect(states[0]?.duplicateValidation).toBeNull();
		expect(states[1]?.duplicateValidation).toBeNull();
	});

	it("reconhece FITID com sufixo #2 como já importado", () => {
		const [state] = resolveImportDuplicateMatches(
			[
				{
					...importRow,
					externalId: "pix-fitid#2",
				},
			],
			{
				candidates: [existingPix],
				fitIdDuplicateIds: new Set(["pix-fitid#2"]),
				duplicateSnapshotByFitId: new Map([["pix-fitid", existingPix]]),
			},
		);

		expect(state.isDuplicate).toBe(true);
		expect(state.duplicateValidation?.status).toBe("match");
	});

	it("marca repetição idêntica no mesmo extrato como duplicata", () => {
		const row = {
			date: "2026-01-15",
			amount: 500,
			description: "Pix recebido",
			transactionType: "income" as const,
			externalId: "line-1",
		};

		const states = resolveImportDuplicateMatches(
			[
				row,
				{ ...row, externalId: "line-1#2" },
			],
			{
				candidates: [],
				fitIdDuplicateIds: new Set(),
				duplicateSnapshotByFitId: new Map(),
			},
		);

		expect(states[0]?.isDuplicate).toBe(false);
		expect(states[1]?.isDuplicate).toBe(true);
	});
});

describe("collectImportLinkedExistingTransactionIds", () => {
	it("coleta ids de linhas vinculadas", () => {
		const ids = collectImportLinkedExistingTransactionIds([
			{ linked: true, linkedTransactionId: "tx-1" },
			{ linked: false },
			{
				linked: true,
				duplicateValidation: {
					status: "link_suggestion",
					matchScore: { date: true, amount: true, description: false },
					mismatches: [],
					existingTransactionId: "tx-2",
					existingPayerId: null,
					existingCategoryId: null,
				},
			},
		]);

		expect([...ids]).toEqual(["tx-1", "tx-2"]);
	});
});
