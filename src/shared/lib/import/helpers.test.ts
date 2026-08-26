import { describe, expect, it } from "vitest";
import {
	buildPeriodFromTransactions,
	dedupeImportedTransactionsByFingerprint,
	expandImportExternalIdsForLookup,
	importExternalIdCollidesWithStored,
	importOccurrenceCollidesWithStored,
	makeSyntheticExternalId,
	parseBrazilianAmount,
	parseBrazilianAmountOrNull,
	parseCnabDate,
	parsePortugueseAbbrevDotDate,
	parsePortugueseLongDate,
	parsePortugueseShortDate,
	parseSlashDateDMY,
	planImportRecordInsertion,
	replaceAmbiguousImportExternalIds,
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

describe("importOccurrenceCollidesWithStored", () => {
	const CLARO_FIT_ID = "698e65bc-3e73-4aa0-831f-a3e68ee7fad1";

	it("não bloqueia a parcela do mês quando outra parcela da série já está gravada", () => {
		// Caso real da fatura de março: o arquivo traz "Claro - Parcela 1/12" com o
		// mesmo FITID que já estava em 5/12 (julho), porque o Nubank reaproveita o
		// id da compra. Barrar por id descartava a 1/12 e março nunca fechava.
		const collides = importOccurrenceCollidesWithStored(
			{
				externalId: CLARO_FIT_ID,
				installmentCount: 12,
				currentInstallment: 1,
			},
			[
				{
					externalId: CLARO_FIT_ID,
					installmentCount: 12,
					currentInstallment: 5,
				},
			],
		);

		expect(collides).toBe(false);
	});

	it("bloqueia a mesma ocorrência da mesma série", () => {
		const collides = importOccurrenceCollidesWithStored(
			{
				externalId: CLARO_FIT_ID,
				installmentCount: 12,
				currentInstallment: 5,
			},
			[
				{
					externalId: CLARO_FIT_ID,
					installmentCount: 12,
					currentInstallment: 5,
				},
			],
		);

		expect(collides).toBe(true);
	});

	it("bloqueia cobrança avulsa repetida, inclusive com sufixo #2", () => {
		expect(
			importOccurrenceCollidesWithStored(
				{
					externalId: "fit-1",
					installmentCount: null,
					currentInstallment: null,
				},
				[
					{
						externalId: "fit-1#2",
						installmentCount: null,
						currentInstallment: null,
					},
				],
			),
		).toBe(true);
	});

	it("não bloqueia quando só um dos lados é parcela", () => {
		expect(
			importOccurrenceCollidesWithStored(
				{ externalId: "fit-1", installmentCount: 12, currentInstallment: 1 },
				[
					{
						externalId: "fit-1",
						installmentCount: null,
						currentInstallment: null,
					},
				],
			),
		).toBe(false);
	});

	it("ignora ocorrências de outro id", () => {
		expect(
			importOccurrenceCollidesWithStored(
				{
					externalId: "fit-1",
					installmentCount: null,
					currentInstallment: null,
				},
				[
					{
						externalId: "fit-outro",
						installmentCount: null,
						currentInstallment: null,
					},
				],
			),
		).toBe(false);
	});
});

describe("planImportRecordInsertion", () => {
	const CLARO_FIT_ID = "698e65bc-3e73-4aa0-831f-a3e68ee7fad1";
	const CLARO_5_DE_12 = {
		externalId: CLARO_FIT_ID,
		installmentCount: 12,
		currentInstallment: 5,
	};

	it("grava a parcela do mês sem o id quando outra parcela da série já é dona dele", () => {
		// O índice único (user_id, ofx_fit_id) só admite um dono. Inserir com o id
		// repetido estourava 23505 e derrubava a importação inteira; pular a linha
		// deixava a fatura sem ela. O caminho certo é gravar sem o id.
		const plan = planImportRecordInsertion(
			{ externalId: CLARO_FIT_ID, installmentCount: 12, currentInstallment: 1 },
			{
				storedOccurrences: [CLARO_5_DE_12],
				storedExternalIds: [CLARO_FIT_ID],
			},
		);

		expect(plan).toBe("insert_without_external_id");
	});

	it("pula quando é a mesma ocorrência já gravada", () => {
		const plan = planImportRecordInsertion(CLARO_5_DE_12, {
			storedOccurrences: [CLARO_5_DE_12],
			storedExternalIds: [CLARO_FIT_ID],
		});

		expect(plan).toBe("skip");
	});

	it("grava com o id quando a cobrança é inédita", () => {
		const plan = planImportRecordInsertion(
			{
				externalId: "fit-novo",
				installmentCount: null,
				currentInstallment: null,
			},
			{ storedOccurrences: [CLARO_5_DE_12], storedExternalIds: [CLARO_FIT_ID] },
		);

		expect(plan).toBe("insert");
	});

	it("pula cobrança avulsa já gravada, mesmo com sufixo #2", () => {
		const plan = planImportRecordInsertion(
			{
				externalId: "fit-1#2",
				installmentCount: null,
				currentInstallment: null,
			},
			{
				storedOccurrences: [
					{
						externalId: "fit-1",
						installmentCount: null,
						currentInstallment: null,
					},
				],
				storedExternalIds: ["fit-1"],
			},
		);

		expect(plan).toBe("skip");
	});
});

describe("importOccurrenceCollidesWithStored: sufixo dentro do mesmo arquivo", () => {
	const avulso = (externalId: string) => ({
		externalId,
		installmentCount: null,
		currentInstallment: null,
	});

	it("com sameFile, o sufixo de id sintético distingue duas cobranças", () => {
		// Caso real da fatura de maio: duas linhas "Ec *Ec*Conectcar | 13,70 |
		// 2026-04-13" — dois pedágios no mesmo dia pelo mesmo valor. O id
		// sintético é igual, e `uniquifyImportedExternalIds` sufixa a segunda.
		// Comparar a base fazia a segunda parecer repetição e abria um furo de
		// R$ 13,70 no total projetado.
		expect(
			importOccurrenceCollidesWithStored(
				avulso("2026-04-13|ec *ec*conectcar|13.7#2"),
				[avulso("2026-04-13|ec *ec*conectcar|13.7")],
				{ sameFile: true },
			),
		).toBe(false);
	});

	it("com sameFile, id igual continua colidindo", () => {
		expect(
			importOccurrenceCollidesWithStored(avulso("fit-1"), [avulso("fit-1")], {
				sameFile: true,
			}),
		).toBe(true);
	});

	it("com sameFile, FITID repetido segue sendo repetição do parser", () => {
		// FITID não tem "|": é id do banco. O mesmo id em duas linhas é o parser
		// emitindo a transação duas vezes, não duas cobranças.
		expect(
			importOccurrenceCollidesWithStored(
				avulso("pix-fitid#2"),
				[avulso("pix-fitid")],
				{ sameFile: true },
			),
		).toBe(true);
	});

	it("sem a opção, a base decide — reimportar o arquivo não duplica", () => {
		expect(
			importOccurrenceCollidesWithStored(avulso("fit-1#2"), [avulso("fit-1")]),
		).toBe(true);
	});
});

describe("replaceAmbiguousImportExternalIds", () => {
	const linha = (
		description: string,
		amount: number,
		externalId: string | null,
	) => ({
		externalId,
		date: "2026-06-02",
		amount,
		description,
		transactionType: "expense" as const,
	});

	it("troca o id que o arquivo repete em cobranças diferentes", () => {
		// Caso real da fatura de junho: o Nubank emite um FITID só para o bloco
		// todo do rotativo. As três linhas casavam com o único lançamento que
		// conseguiu guardar esse id e saíam da conferência como "já cadastrado em
		// outro período", abrindo um furo de R$ 6.135,89.
		const FITID = "6a07939b-fc2e-4aeb-96a8-03a403e249ad";

		const rows = replaceAmbiguousImportExternalIds([
			linha("Valor pendente do mês anterior (rotativo)", 5525.23, FITID),
			linha("Juros de pagamento parcial da fatura (rotativo)", 575.4, FITID),
			linha("IOF de pagamento parcial da fatura (rotativo)", 35.26, FITID),
		]);

		expect(rows.every((row) => row.externalId !== FITID)).toBe(true);
		expect(new Set(rows.map((row) => row.externalId)).size).toBe(3);
		// O id derivado da linha é estável entre reimportações.
		expect(rows[0].externalId).toBe(
			"2026-06-02|5525.23|valor pendente do mês anterior (rotativo)",
		);
	});

	it("preserva id repetido em linhas de conteúdo igual", () => {
		// Aqui o id repetido é repetição do parser ou duas cobranças idênticas —
		// tratado adiante por uniquify/dedupe, não aqui.
		const rows = replaceAmbiguousImportExternalIds([
			linha("Ec *Ec*Conectcar", 13.7, "fit-1"),
			linha("Ec *Ec*Conectcar", 13.7, "fit-1"),
		]);

		expect(rows.map((row) => row.externalId)).toEqual(["fit-1", "fit-1"]);
	});

	it("preserva id único", () => {
		const rows = replaceAmbiguousImportExternalIds([
			linha("Padaria", 10, "fit-1"),
			linha("Posto", 20, "fit-2"),
		]);

		expect(rows.map((row) => row.externalId)).toEqual(["fit-1", "fit-2"]);
	});

	it("não mexe em linha sem id", () => {
		const rows = replaceAmbiguousImportExternalIds([
			linha("Padaria", 10, null),
			linha("Posto", 20, null),
		]);

		expect(rows.map((row) => row.externalId)).toEqual([null, null]);
	});
});

describe("parseBrazilianAmountOrNull", () => {
	it("lê o formato brasileiro", () => {
		expect(parseBrazilianAmountOrNull("1.234,56")).toBe(1234.56);
		expect(parseBrazilianAmountOrNull("R$ 1.234,56")).toBe(1234.56);
		expect(parseBrazilianAmountOrNull("-1.234,56")).toBe(-1234.56);
		expect(parseBrazilianAmountOrNull("89,90")).toBe(89.9);
	});

	it("lê o formato americano pelo último separador", () => {
		expect(parseBrazilianAmountOrNull("1,234.56")).toBe(1234.56);
		expect(parseBrazilianAmountOrNull("1,234,567.89")).toBe(1234567.89);
	});

	it("só com pontos, três casas é milhar e duas é decimal", () => {
		expect(parseBrazilianAmountOrNull("1.234")).toBe(1234);
		expect(parseBrazilianAmountOrNull("89.90")).toBe(89.9);
		expect(parseBrazilianAmountOrNull("89.9")).toBe(89.9);
	});

	it("reconhece as três formas de negativo do extrato", () => {
		// Sem isto a linha caía em zero e era descartada em silêncio.
		expect(parseBrazilianAmountOrNull("(1.234,56)")).toBe(-1234.56);
		expect(parseBrazilianAmountOrNull("1.234,56-")).toBe(-1234.56);
		expect(parseBrazilianAmountOrNull("−1.234,56")).toBe(-1234.56);
		expect(parseBrazilianAmountOrNull("–1.234,56")).toBe(-1234.56);
	});

	it("devolve null no ilegível, em vez de zero", () => {
		expect(parseBrazilianAmountOrNull("")).toBeNull();
		expect(parseBrazilianAmountOrNull("   ")).toBeNull();
		expect(parseBrazilianAmountOrNull("abc")).toBeNull();
		expect(parseBrazilianAmountOrNull("R$")).toBeNull();
		expect(parseBrazilianAmountOrNull("1.2a4,56")).toBeNull();
	});

	it("aceita o mais explícito do extrato", () => {
		// "Total de entradas +8.629,88" — sem isto a string inteira era recusada.
		expect(parseBrazilianAmountOrNull("+8.629,88")).toBe(8629.88);
		expect(parseBrazilianAmountOrNull("+ 8.629,88")).toBe(8629.88);
		expect(parseBrazilianAmountOrNull("+0,00")).toBe(0);
	});

	it("zero de verdade continua sendo zero", () => {
		expect(parseBrazilianAmountOrNull("0,00")).toBe(0);
		expect(parseBrazilianAmountOrNull("R$ 0,00")).toBe(0);
	});

	it("parseBrazilianAmount mantém o contrato antigo de zero", () => {
		expect(parseBrazilianAmount("abc")).toBe(0);
		expect(parseBrazilianAmount("1.234,56")).toBe(1234.56);
	});
});

describe("datas impossíveis não passam", () => {
	it("parseSlashDateDMY recusa dia que não existe no mês", () => {
		expect(parseSlashDateDMY("31/02/2026")).toBeNull();
		expect(parseSlashDateDMY("30/02/2026")).toBeNull();
		expect(parseSlashDateDMY("31/04/2026")).toBeNull();
		expect(parseSlashDateDMY("00/01/2026")).toBeNull();
		expect(parseSlashDateDMY("01/13/2026")).toBeNull();
	});

	it("parseSlashDateDMY aceita data válida, inclusive 29/02 bissexto", () => {
		expect(parseSlashDateDMY("05/07/2026")).toBe("2026-07-05");
		expect(parseSlashDateDMY("29/02/2024")).toBe("2024-02-29");
		expect(parseSlashDateDMY("29/02/2026")).toBeNull();
	});

	it("parseCnabDate recusa data impossível", () => {
		expect(parseCnabDate("31022026")).toBeNull();
		expect(parseCnabDate("05072026")).toBe("2026-07-05");
	});

	it("parsePortugueseLongDate recusa data impossível", () => {
		expect(parsePortugueseLongDate("31", "fevereiro", "2026")).toBeNull();
		expect(parsePortugueseLongDate("05", "julho", "2026")).toBe("2026-07-05");
	});

	it("parsePortugueseAbbrevDotDate recusa data impossível", () => {
		expect(parsePortugueseAbbrevDotDate("31", "fev.", "2026")).toBeNull();
		expect(parsePortugueseAbbrevDotDate("05", "jul.", "2026")).toBe(
			"2026-07-05",
		);
	});

	it("parsePortugueseShortDate recusa data impossível", () => {
		expect(parsePortugueseShortDate("31", "fev", 2026)).toBeNull();
		expect(parsePortugueseShortDate("05", "jul", 2026)).toBe("2026-07-05");
	});
});
