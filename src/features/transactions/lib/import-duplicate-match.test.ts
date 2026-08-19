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

	it("reconhece lançamento à vista na mesma fatura por nome+valor", () => {
		const validation = buildImportDuplicateValidation(
			{
				date: "2026-02-12",
				amount: 21.9,
				description: "Spotify",
				transactionType: "expense",
			},
			{
				id: "manual-spotify",
				ofxFitId: null,
				name: "Spotify",
				amount: "-21.90",
				purchaseDate: new Date(2026, 1, 5),
				transactionType: "Despesa",
				currentInstallment: null,
				installmentCount: null,
				payerId: null,
				categoryId: null,
				period: "2026-02",
			},
			undefined,
			{ invoicePeriods: ["2026-02"] },
		);

		expect(validation.status).toBe("match");
		expect(validation.mismatches).toEqual([]);
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

	it("não casa parcela do arquivo com outra parcela da série em fatura anterior", () => {
		const row = {
			date: "2026-02-05",
			amount: 260,
			description: "Fabio C Thomaziello - Parcela 3/10",
			transactionType: "expense" as const,
			installmentImport: {
				enabled: true as const,
				name: "Fabio C Thomaziello",
				currentInstallment: 3,
				installmentCount: 10,
			},
		};

		expect(
			findInstallmentDuplicateSnapshot(
				row,
				[
					{
						...existingInstallment,
						id: "existing-junho",
						name: "Fabio C Thomaziello",
						currentInstallment: null,
						installmentCount: null,
						period: "2026-06",
					},
				],
				{ invoicePeriods: ["2026-02"] },
			),
		).toBeNull();
	});

	it("mantém o casamento da mesma parcela N/M cadastrada em outro período", () => {
		const row = {
			date: "2026-02-05",
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
				[{ ...existingInstallment, period: "2026-06" }],
				{ invoicePeriods: ["2026-02"] },
			)?.id,
		).toBe("existing-4");
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

	it("não trata FITID reaproveitado entre parcelas como reimportação", () => {
		// Nubank repete o mesmo FITID em toda parcela de uma compra parcelada — o
		// identificador é da compra, não da cobrança do mês. A parcela 1/5 do
		// arquivo não pode ser tratada como "já importada" só porque a parcela
		// 5/5 (outro mês, nunca a mesma ocorrência) foi cadastrada com esse FITID.
		const installmentRow = {
			date: "2026-03-04",
			amount: 35.51,
			description: "Mercado*Mercadolivre - Parcela 1/5",
			transactionType: "expense" as const,
			externalId: "fit-parcelado",
			installmentImport: {
				enabled: true as const,
				name: "Mercado*Mercadolivre",
				currentInstallment: 1,
				installmentCount: 5,
			},
		};
		const existingOutraParcela = {
			id: "existing-parcela-5",
			ofxFitId: "fit-parcelado",
			name: "Mercado*Mercadolivre",
			amount: "-35.50",
			purchaseDate: new Date(2026, 5, 5),
			transactionType: "Despesa",
			currentInstallment: 5,
			installmentCount: 5,
			payerId: null,
			categoryId: null,
			period: "2026-07",
		};

		const [state] = resolveImportDuplicateMatches([installmentRow], {
			candidates: [existingOutraParcela],
			fitIdDuplicateIds: new Set(["fit-parcelado"]),
			duplicateSnapshotByFitId: new Map([
				["fit-parcelado", existingOutraParcela],
			]),
			options: { invoicePeriods: ["2026-03"] },
		});

		expect(state.isDuplicate).toBe(false);
		expect(state.duplicateValidation).toBeNull();
	});

	it("mantém a reimportação real da mesma parcela como duplicata", () => {
		const installmentRow = {
			date: "2026-07-05",
			amount: 35.5,
			description: "Mercado*Mercadolivre - Parcela 5/5",
			transactionType: "expense" as const,
			externalId: "fit-parcelado",
			installmentImport: {
				enabled: true as const,
				name: "Mercado*Mercadolivre",
				currentInstallment: 5,
				installmentCount: 5,
			},
		};
		const existingMesmaParcela = {
			id: "existing-parcela-5",
			ofxFitId: "fit-parcelado",
			name: "Mercado*Mercadolivre",
			amount: "-35.50",
			purchaseDate: new Date(2026, 5, 5),
			transactionType: "Despesa",
			currentInstallment: 5,
			installmentCount: 5,
			payerId: null,
			categoryId: null,
			period: "2026-07",
		};

		const [state] = resolveImportDuplicateMatches([installmentRow], {
			candidates: [existingMesmaParcela],
			fitIdDuplicateIds: new Set(["fit-parcelado"]),
			duplicateSnapshotByFitId: new Map([
				["fit-parcelado", existingMesmaParcela],
			]),
			options: { invoicePeriods: ["2026-07"] },
		});

		expect(state.isDuplicate).toBe(true);
		expect(state.duplicateValidation?.status).toBe("match");
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
			[row, { ...row, externalId: "line-1#2" }],
			{
				candidates: [],
				fitIdDuplicateIds: new Set(),
				duplicateSnapshotByFitId: new Map(),
			},
		);

		expect(states[0]?.isDuplicate).toBe(false);
		expect(states[1]?.isDuplicate).toBe(true);
	});

	it("não colapsa duas cobranças reais com o mesmo fingerprint mas FITID diferente", () => {
		// Pedágio recarregado duas vezes no mesmo dia pelo mesmo valor: mesma
		// data+valor+descrição, mas cada linha do OFX tem seu próprio FITID real.
		const row = {
			date: "2026-03-04",
			amount: 13.6,
			description: "Ec *Ec*Conectcar",
			transactionType: "expense" as const,
			externalId: "fitid-manha",
		};

		const states = resolveImportDuplicateMatches(
			[row, { ...row, externalId: "fitid-tarde" }],
			{
				candidates: [],
				fitIdDuplicateIds: new Set(),
				duplicateSnapshotByFitId: new Map(),
			},
		);

		expect(states[0]?.isDuplicate).toBe(false);
		expect(states[1]?.isDuplicate).toBe(false);
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

describe("duas linhas idênticas no mesmo arquivo", () => {
	const conectcar = (externalId: string) => ({
		externalId,
		date: "2026-04-13",
		amount: 13.7,
		description: "Ec *Ec*Conectcar",
		transactionType: "expense" as const,
	});

	it("mantém as duas cobranças, distinguidas pelo sufixo do id", () => {
		// Caso real da fatura de maio: dois pedágios no mesmo dia pelo mesmo
		// valor. O id sintético do PDF é igual nas duas linhas e
		// `uniquifyImportedExternalIds` sufixa a segunda com "#2". Comparar a base
		// fazia a segunda parecer repetição do parser: ela era colapsada como
		// duplicata e o total projetado ficava R$ 13,70 abaixo do arquivo.
		const states = resolveImportDuplicateMatches(
			[
				conectcar("2026-04-13|ec *ec*conectcar|13.7"),
				conectcar("2026-04-13|ec *ec*conectcar|13.7#2"),
			],
			{
				candidates: [],
				fitIdDuplicateIds: new Set(),
				duplicateSnapshotByFitId: new Map(),
			},
		);

		expect(states.map((state) => state.isDuplicate)).toEqual([false, false]);
	});

	it("ainda colapsa repetição do parser, quando não há id por linha", () => {
		const states = resolveImportDuplicateMatches(
			[
				{ ...conectcar(""), externalId: null },
				{ ...conectcar(""), externalId: null },
			],
			{
				candidates: [],
				fitIdDuplicateIds: new Set(),
				duplicateSnapshotByFitId: new Map(),
			},
		);

		expect(states.map((state) => state.isDuplicate)).toEqual([false, true]);
	});
});
