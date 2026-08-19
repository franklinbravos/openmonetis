import { describe, expect, it } from "vitest";
import {
	buildPeriodFromTransactions,
	dedupeImportedTransactionsByFingerprint,
	expandImportExternalIdsForLookup,
	importExternalIdCollidesWithStored,
	makeSyntheticExternalId,
	parseBrazilianAmount,
	parseCnabDate,
	parsePortugueseAbbrevDotDate,
	parsePortugueseLongDate,
	parsePortugueseShortDate,
	parseSlashDateDMY,
	stripImportExternalIdSuffix,
	uniquifyImportedExternalIds,
} from "./helpers";

describe("parseBrazilianAmount", () => {
	it("parseia valor com separador brasileiro", () => {
		expect(parseBrazilianAmount("1.234,56")).toBe(1234.56);
	});

	it("parseia valor negativo", () => {
		expect(parseBrazilianAmount("-100,00")).toBe(-100);
	});

	it("parseia com prefixo R$", () => {
		expect(parseBrazilianAmount("R$ 50,00")).toBe(50);
	});

	it("remove espaços internos", () => {
		expect(parseBrazilianAmount("1 000,00")).toBe(1000);
	});

	it("retorna 0 para valor inválido", () => {
		expect(parseBrazilianAmount("abc")).toBe(0);
		expect(parseBrazilianAmount("")).toBe(0);
	});
});

describe("parseSlashDateDMY", () => {
	it("converte dd/mm/aaaa para YYYY-MM-DD", () => {
		expect(parseSlashDateDMY("15/01/2024")).toBe("2024-01-15");
	});

	it("preenche com zero à esquerda", () => {
		expect(parseSlashDateDMY("5/3/2024")).toBe("2024-03-05");
	});

	it("retorna null para formato inválido", () => {
		expect(parseSlashDateDMY("2024-01-15")).toBeNull();
		expect(parseSlashDateDMY("")).toBeNull();
	});
});

describe("parseCnabDate", () => {
	it("converte ddmmaaaa para YYYY-MM-DD", () => {
		expect(parseCnabDate("15012024")).toBe("2024-01-15");
	});

	it("retorna null para formato inválido", () => {
		expect(parseCnabDate("abc")).toBeNull();
		expect(parseCnabDate("")).toBeNull();
		expect(parseCnabDate("150120241")).toBeNull();
	});
});

describe("datas em português", () => {
	it("parsePortugueseLongDate aceita nome por extenso", () => {
		expect(parsePortugueseLongDate("15", "janeiro", "2024")).toBe("2024-01-15");
		expect(parsePortugueseLongDate("15", "Março", "2024")).toBe("2024-03-15");
	});

	it("parsePortugueseLongDate retorna null para mês inválido", () => {
		expect(parsePortugueseLongDate("15", "fevereiroo", "2024")).toBeNull();
	});

	it("parsePortugueseShortDate aceita abreviação", () => {
		expect(parsePortugueseShortDate("15", "fev", 2024)).toBe("2024-02-15");
		expect(parsePortugueseShortDate("15", "set", 2024)).toBe("2024-09-15");
	});

	it("parsePortugueseAbbrevDotDate aceita abreviação com ponto", () => {
		expect(parsePortugueseAbbrevDotDate("15", "fev.", "2024")).toBe(
			"2024-02-15",
		);
		expect(parsePortugueseAbbrevDotDate("15", "out", "2024")).toBe(
			"2024-10-15",
		);
	});
});

describe("buildPeriodFromTransactions", () => {
	it("deriva período dos extremos das datas", () => {
		const transactions = [
			{ date: "2024-01-10" },
			{ date: "2024-01-02" },
			{ date: "2024-01-20" },
		];
		expect(buildPeriodFromTransactions(transactions)).toEqual({
			from: "2024-01-02",
			to: "2024-01-20",
		});
	});

	it("retorna null sem transações", () => {
		expect(buildPeriodFromTransactions([])).toBeNull();
	});
});

describe("makeSyntheticExternalId", () => {
	it("une partes normalizadas com pipe", () => {
		expect(makeSyntheticExternalId(["2024-01-15", "50.00", "Mercado"])).toBe(
			"2024-01-15|50.00|mercado",
		);
	});

	it("colapsa espaços dentro de cada parte e mantém separador", () => {
		expect(makeSyntheticExternalId(["Pagamento  ", "Cartão"])).toBe(
			"pagamento|cartão",
		);
	});
});

describe("uniquifyImportedExternalIds", () => {
	it("mantém o primeiro id e sufixa as colisões", () => {
		const result = uniquifyImportedExternalIds([
			{ externalId: "a|b|1" },
			{ externalId: "a|b|1" },
			{ externalId: "c" },
			{ externalId: "a|b|1" },
			{ externalId: null },
		]);

		expect(result.map((row) => row.externalId)).toEqual([
			"a|b|1",
			"a|b|1#2",
			"c",
			"a|b|1#3",
			null,
		]);
	});
});

describe("stripImportExternalIdSuffix", () => {
	it("remove sufixo numérico de colisão no extrato", () => {
		expect(stripImportExternalIdSuffix("2025-08-01|20.00|pix")).toBe(
			"2025-08-01|20.00|pix",
		);
		expect(stripImportExternalIdSuffix("2025-08-01|20.00|pix#2")).toBe(
			"2025-08-01|20.00|pix",
		);
	});
});

describe("importExternalIdCollidesWithStored", () => {
	it("trata sufixos do mesmo lançamento como colisão", () => {
		const stored = ["2025-08-01|20.00|pix"];

		expect(
			importExternalIdCollidesWithStored("2025-08-01|20.00|pix#2", stored),
		).toBe(true);
		expect(
			importExternalIdCollidesWithStored("2025-08-01|20.00|pix", stored),
		).toBe(true);
	});
});

describe("dedupeImportedTransactionsByFingerprint", () => {
	it("mantém duas compras iguais no mesmo dia quando têm id próprio", () => {
		const rows = dedupeImportedTransactionsByFingerprint(
			uniquifyImportedExternalIds([
				{
					externalId: "2025-12-07|mikrolot hamburguer|47",
					date: "2025-12-07",
					amount: 47,
					description: "Mikrolot Hamburguer",
					transactionType: "expense" as const,
				},
				{
					externalId: "2025-12-07|mikrolot hamburguer|47",
					date: "2025-12-07",
					amount: 47,
					description: "Mikrolot Hamburguer",
					transactionType: "expense" as const,
				},
			]),
		);

		expect(rows.map((row) => row.externalId)).toEqual([
			"2025-12-07|mikrolot hamburguer|47",
			"2025-12-07|mikrolot hamburguer|47#2",
		]);
	});

	it("remove repetições exatas do parser", () => {
		const rows = dedupeImportedTransactionsByFingerprint([
			{
				date: "2025-08-01",
				amount: 20,
				description: "Pix recebido",
				transactionType: "income",
			},
			{
				date: "2025-08-01",
				amount: 20,
				description: "Pix recebido",
				transactionType: "income",
			},
			{
				date: "2025-08-04",
				amount: 20,
				description: "Pix recebido",
				transactionType: "income",
			},
		]);

		expect(rows).toHaveLength(2);
	});
});

describe("expandImportExternalIdsForLookup", () => {
	it("inclui id base e com sufixo", () => {
		expect(expandImportExternalIdsForLookup(["abc#2", "def"]).sort()).toEqual(
			["abc", "abc#2", "def"].sort(),
		);
	});
});
