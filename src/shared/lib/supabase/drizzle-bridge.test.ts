import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	not,
	or,
	sql,
} from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { importBatches, payers, transactions } from "@/db/schema";
import {
	__applyFiltersForTests as applyFiltersForTests,
	__decodeColumnValueForTests as decodeColumnValue,
	describePostgrestError,
	extractOrderSpec,
	isTransientPostgrestFailure,
	__parseWhereForTests as parseWhere,
	runWithTransientRetry,
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
		// Era `eq(id, null)`, e era exatamente daí que saía o `id=eq.null` que o
		// PostgREST recusava com 22P02 numa coluna uuid. A condição impossível
		// agora é atômica e não depende do tipo de nenhuma coluna.
		expect(parseWhere(inArray(transactions.id, []))).toEqual([
			{ type: "matchNothing" },
		]);
	});

	it("sql`false` também vira condição impossível", () => {
		// A busca sem resultado e o filtro "com anexo" sem anexos usam `sql`false``
		// para dizer "nenhum resultado" — e derrubavam a página de Lançamentos.
		expect(parseWhere(sql`false`)).toEqual([{ type: "matchNothing" }]);
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

describe("describePostgrestError", () => {
	it("erro vazio é falha de transporte, não de consulta", () => {
		// O supabase-js devolve `{}` quando o fetch falha. Antes o log dizia
		// `error: Object` e a exceção dizia "Falha na consulta PostgREST" — as
		// duas mandavam procurar SQL errado quando o problema era rede.
		const described = describePostgrestError({});

		expect(described.message).toMatch(/transporte/i);
		expect(described.code).toBeNull();
	});

	it("erro de verdade chega inteiro no log", () => {
		const described = describePostgrestError({
			message: 'column "x" does not exist',
			code: "42703",
			details: null,
			hint: "Perhaps you meant y",
		});

		expect(described).toEqual({
			message: 'column "x" does not exist',
			code: "42703",
			details: null,
			hint: "Perhaps you meant y",
		});
	});

	it("cai para details e depois para hint quando não há message", () => {
		expect(describePostgrestError({ details: "só detalhe" }).message).toBe(
			"só detalhe",
		);
		expect(describePostgrestError({ hint: "só dica" }).message).toBe("só dica");
	});
});

describe("isTransientPostgrestFailure", () => {
	it("5xx e 429 são soluço de transporte", () => {
		expect(isTransientPostgrestFailure({}, 502)).toBe(true);
		expect(isTransientPostgrestFailure({}, 503)).toBe(true);
		expect(isTransientPostgrestFailure({}, 429)).toBe(true);
	});

	it("erro sem corpo é soluço, mesmo sem status", () => {
		expect(isTransientPostgrestFailure({})).toBe(true);
	});

	it("4xx nunca é retentado, mesmo sem corpo de erro", () => {
		// O caso real: a contagem usa HEAD, e resposta HEAD não tem corpo — então
		// um 400 chega sem mensagem e parecia soluço de transporte. Era repetido
		// três vezes, sempre com o mesmo 400.
		expect(isTransientPostgrestFailure({}, 400)).toBe(false);
		expect(isTransientPostgrestFailure({}, 404)).toBe(false);
		expect(isTransientPostgrestFailure({}, 401)).toBe(false);
	});

	it("erro de SQL nunca é retentado", () => {
		// Repetir daria exatamente o mesmo erro — e esconderia o problema real
		// atrás de três tentativas.
		expect(
			isTransientPostgrestFailure(
				{ message: 'column "x" does not exist', code: "42703" },
				400,
			),
		).toBe(false);
		expect(isTransientPostgrestFailure({ message: "boom" }, 404)).toBe(false);
	});
});

describe("runWithTransientRetry", () => {
	it("repete o soluço e devolve o acerto", async () => {
		let chamadas = 0;
		const result = await runWithTransientRetry(() => {
			chamadas++;
			return Promise.resolve(
				chamadas < 3
					? { error: {}, status: 503 }
					: { error: null, status: 200, count: 7 },
			);
		});

		expect(chamadas).toBe(3);
		expect(result).toMatchObject({ error: null, count: 7 });
	});

	it("não repete erro de consulta", async () => {
		let chamadas = 0;
		await runWithTransientRetry(() => {
			chamadas++;
			return Promise.resolve({
				error: { message: "sintaxe", code: "42601" },
				status: 400,
			});
		});

		expect(chamadas).toBe(1);
	});

	it("desiste depois do limite, devolvendo o último erro", async () => {
		let chamadas = 0;
		const result = await runWithTransientRetry(() => {
			chamadas++;
			return Promise.resolve({ error: {}, status: 502 });
		});

		// A primeira mais duas tentativas.
		expect(chamadas).toBe(3);
		expect(result.error).toEqual({});
	});
});

const BUILDER_METHODS = [
	"eq",
	"neq",
	"gt",
	"gte",
	"lt",
	"lte",
	"is",
	"in",
	"or",
	"ilike",
	"like",
	"not",
] as const;

type FakeBuilder = Record<
	(typeof BUILDER_METHODS)[number],
	(...args: unknown[]) => FakeBuilder
> & { calls: Array<{ method: string; args: unknown[] }> };

/** Builder falso que registra o que a ponte pediu ao PostgREST. */
function fakeBuilder(): FakeBuilder {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const builder = { calls } as FakeBuilder;
	for (const method of BUILDER_METHODS) {
		builder[method] = (...args: unknown[]) => {
			calls.push({ method, args });
			return builder;
		};
	}
	return builder;
}

describe("comparação com null não vira literal", () => {
	// PostgREST manda converter o texto `null` para o tipo da coluna: em uuid é
	// `22P02 invalid input syntax`, que volta 400. Era o que derrubava a página
	// de Lançamentos.
	it("eq(col, null) não emite eq.null e não casa nada", () => {
		const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
		const builder = fakeBuilder();

		applyFiltersForTests(builder, eq(transactions.payerId, null as never));

		expect(builder.calls.map((call) => call.method)).toEqual(["is", "not"]);
		expect(builder.calls[0]?.args).toEqual(["pagador_id", null]);
		expect(builder.calls[1]?.args).toEqual(["pagador_id", "is", null]);
		expect(avisos).toHaveBeenCalledOnce();
		avisos.mockRestore();
	});

	it("o aviso nomeia coluna e operador", () => {
		const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});

		applyFiltersForTests(
			fakeBuilder(),
			eq(transactions.cardId, undefined as never),
		);

		expect(avisos.mock.calls[0]?.[1]).toMatchObject({
			column: "cartao_id",
			operator: "eq",
		});
		avisos.mockRestore();
	});

	it("neq, gt, gte, lt e lte recebem o mesmo tratamento", () => {
		const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});

		for (const where of [
			ne(transactions.payerId, null as never),
			gt(transactions.purchaseDate, null as never),
			gte(transactions.purchaseDate, null as never),
			lt(transactions.purchaseDate, null as never),
			lte(transactions.purchaseDate, null as never),
		]) {
			const builder = fakeBuilder();
			applyFiltersForTests(builder, where);
			expect(builder.calls.map((call) => call.method)).toEqual(["is", "not"]);
		}
		avisos.mockRestore();
	});

	it("isNull continua virando is.null", () => {
		const builder = fakeBuilder();

		applyFiltersForTests(builder, isNull(transactions.payerId));

		expect(builder.calls).toEqual([
			{ method: "is", args: ["pagador_id", null] },
		]);
	});

	it("dentro de or(), o ramo com null não derruba os outros", () => {
		// Devolver null para o ramo faria a ponte descartar o `or` inteiro e
		// alargar o resultado em silêncio.
		const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
		const builder = fakeBuilder();

		applyFiltersForTests(
			builder,
			or(eq(transactions.payerId, null as never), eq(transactions.id, "x")),
		);

		expect(builder.calls).toHaveLength(1);
		const expr = String(builder.calls[0]?.args[0]);
		expect(builder.calls[0]?.method).toBe("or");
		expect(expr).not.toContain("eq.null");
		expect(expr).toContain("and(pagador_id.is.null,pagador_id.not.is.null)");
		expect(expr).toContain('id.eq."x"');
		avisos.mockRestore();
	});

	it("in descarta os nulos e mantém o resto", () => {
		const builder = fakeBuilder();

		applyFiltersForTests(
			builder,
			inArray(transactions.id, ["a", null as never, "b"]),
		);

		expect(builder.calls).toEqual([{ method: "in", args: ["id", ["a", "b"]] }]);
	});

	it("in só de nulos não casa nada, em vez de quebrar a consulta", () => {
		const builder = fakeBuilder();

		applyFiltersForTests(builder, inArray(transactions.id, [null as never]));

		expect(builder.calls.map((call) => call.method)).toEqual(["is", "not"]);
	});
});
