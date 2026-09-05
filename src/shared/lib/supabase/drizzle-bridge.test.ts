import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	not,
	or,
	sql,
} from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { importBatches, payers, transactions } from "@/db/schema";
import {
	__decodeColumnValueForTests as decodeColumnValue,
	extractOrderSpec,
	__parseWhereForTests as parseWhere,
} from "./drizzle-bridge";

describe("extractOrderSpec", () => {
	it("reconhece desc() como descendente", () => {
		// O StringChunk do Drizzle guarda o " desc" em `value` como array de
		// strings. Ler só strings simples fazia todo desc() virar asc() calado —
		// e findFirst devolvia a linha mais antiga em vez da mais recente.
		const spec = extractOrderSpec(desc(importBatches.createdAt));

		expect(spec.column?.name).toBe("created_at");
		expect(spec.ascending).toBe(false);
	});

	it("reconhece asc() como ascendente", () => {
		const spec = extractOrderSpec(asc(importBatches.createdAt));

		expect(spec.column?.name).toBe("created_at");
		expect(spec.ascending).toBe(true);
	});

	it("trata coluna crua como ascendente", () => {
		const spec = extractOrderSpec(importBatches.createdAt);

		expect(spec.column?.name).toBe("created_at");
		expect(spec.ascending).toBe(true);
	});
});

describe("parseWhere: condições traduzíveis", () => {
	it("eq", () => {
		expect(parseWhere(eq(transactions.userId, "u1"))).toEqual([
			{ type: "eq", table: "lancamentos", column: "user_id", value: "u1" },
		]);
	});

	it("isNull vira checagem de nulo", () => {
		// `isNull` chega como um único chunk " is null". A versão anterior só
		// testava op === "is", então todo isNull/isNotNull do app era descartado
		// em silêncio e a consulta voltava sem aquele filtro.
		expect(parseWhere(isNull(transactions.cardId))).toEqual([
			{
				type: "is",
				table: "lancamentos",
				column: "cartao_id",
				value: null,
				negated: false,
			},
		]);
	});

	it("isNotNull vira checagem de nulo negada", () => {
		expect(parseWhere(isNotNull(transactions.installmentCount))).toEqual([
			{
				type: "is",
				table: "lancamentos",
				column: "qtde_parcela",
				value: null,
				negated: true,
			},
		]);
	});

	it("NOT LIKE em texto", () => {
		expect(parseWhere(sql`${transactions.note} NOT LIKE ${"AUTO%"}`)).toEqual([
			{
				type: "like",
				table: "lancamentos",
				column: "anotacao",
				value: "AUTO%",
				negated: true,
			},
		]);
	});

	it("not(ilike)", () => {
		expect(parseWhere(not(ilike(transactions.name, "x%")))).toEqual([
			{
				type: "ilike",
				table: "lancamentos",
				column: "nome",
				value: "x%",
				negated: true,
			},
		]);
	});

	it("inArray", () => {
		expect(parseWhere(inArray(transactions.id, ["a", "b"]))).toEqual([
			{
				type: "in",
				table: "lancamentos",
				column: "id",
				values: ["a", "b"],
			},
		]);
	});

	it("inArray vazio vira condição impossível", () => {
		expect(parseWhere(inArray(transactions.id, []))).toEqual([
			{ type: "eq", column: "id", value: null },
		]);
	});

	it("and preserva todas as condições", () => {
		// Antes o scanner devolvia só o que reconhecia: um and(eq, NOT LIKE)
		// chegava ao banco como apenas o eq.
		const filters = parseWhere(
			and(
				eq(transactions.userId, "u1"),
				sql`${transactions.note} NOT LIKE ${"AUTO%"}`,
			),
		);

		expect(filters).toHaveLength(2);
		expect(filters.map((filter) => filter.type)).toEqual(["eq", "like"]);
	});

	it("or aninha as condições", () => {
		const filters = parseWhere(
			or(eq(transactions.userId, "u"), eq(transactions.cardId, "c")),
		);

		expect(filters).toEqual([
			{
				type: "or",
				filters: [
					{ type: "eq", table: "lancamentos", column: "user_id", value: "u" },
					{ type: "eq", table: "lancamentos", column: "cartao_id", value: "c" },
				],
			},
		]);
	});
});

describe("parseWhere: recusa o que não tem tradução", () => {
	// Descartar a condição em silêncio devolvia dado financeiro errado como se
	// estivesse certo. Falhar alto é o comportamento correto.
	it("chamada de função sobre coluna", () => {
		expect(() =>
			parseWhere(eq(sql`lower(${payers.email})`, "a@b.com")),
		).toThrow(/não traduzível/);
	});

	it("aritmética sobre coluna", () => {
		expect(() =>
			parseWhere(gte(sql`abs(${transactions.amount})`, "10.00")),
		).toThrow(/não traduzível/);
	});

	it("subconsulta", () => {
		expect(() =>
			parseWhere(
				sql`EXISTS (SELECT 1 FROM outra WHERE x = ${transactions.id})`,
			),
		).toThrow(/não traduzível/);
	});
});

describe("decodeColumnValue: fidelidade de tipo", () => {
	it("date vira Date", () => {
		// A API devolve string; o schema promete Date. Sem converter, qualquer
		// `.getTime()` no consumidor estoura.
		const value = decodeColumnValue(transactions.purchaseDate, "2026-01-14");

		expect(value).toBeInstanceOf(Date);
		expect((value as Date).toISOString().slice(0, 10)).toBe("2026-01-14");
	});

	it("timestamp vira Date", () => {
		expect(
			decodeColumnValue(transactions.createdAt, "2026-08-19T15:06:21Z"),
		).toBeInstanceOf(Date);
	});

	it("numeric vira string, como o schema declara", () => {
		expect(decodeColumnValue(transactions.amount, 6003.17)).toBe("6003.17");
	});

	it("preserva nulo", () => {
		expect(decodeColumnValue(transactions.cardId, null)).toBeNull();
	});

	it("preserva valor já no tipo certo", () => {
		const date = new Date("2026-01-14T00:00:00Z");
		expect(decodeColumnValue(transactions.purchaseDate, date)).toBe(date);
		expect(decodeColumnValue(transactions.amount, "10.00")).toBe("10.00");
	});

	it("data inválida não é convertida", () => {
		expect(decodeColumnValue(transactions.purchaseDate, "sem data")).toBe(
			"sem data",
		);
	});
});
