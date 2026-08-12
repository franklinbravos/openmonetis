import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callRpc, callRpcOne, snakeToCamel, toRpcNumber } from "./rpc";

const rpcMock = vi.hoisted(() => ({
	rpc: vi.fn(),
}));

vi.mock("@/shared/lib/supabase/admin", () => ({
	getSupabaseAdmin: () => ({ rpc: rpcMock.rpc }),
}));

beforeEach(() => {
	rpcMock.rpc.mockReset();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("callRpc", () => {
	it("retorna array tipado quando data vem preenchida", async () => {
		rpcMock.rpc.mockResolvedValue({
			data: [{ total_amount: "10.5" }],
			error: null,
		});

		const rows = await callRpc<{ total_amount: string }>("sum_lancamentos");

		expect(rows).toEqual([{ total_amount: "10.5" }]);
	});

	it("propaga erro do Supabase com a mensagem", async () => {
		const supabaseError = new Error("Relation does not exist");
		rpcMock.rpc.mockResolvedValue({ data: null, error: supabaseError });

		await expect(callRpc("sum_lancamentos")).rejects.toThrow(
			"Relation does not exist",
		);
	});

	it("propaga string de erro como Error", async () => {
		rpcMock.rpc.mockResolvedValue({ data: null, error: "function not found" });

		await expect(callRpc("sum_lancamentos")).rejects.toThrow(
			"function not found",
		);
	});

	it("converte erro objeto do PostgREST em Error com código", async () => {
		rpcMock.rpc.mockResolvedValue({
			data: null,
			error: {
				code: "22P02",
				message: 'invalid input syntax for type uuid: ""',
			},
		});

		await expect(callRpc("sum_lancamentos")).rejects.toThrow(
			'[22P02] invalid input syntax for type uuid: ""',
		);
	});

	it("retorna [] quando data é null sem erro", async () => {
		rpcMock.rpc.mockResolvedValue({ data: null, error: null });

		await expect(callRpc("sum_lancamentos")).resolves.toEqual([]);
	});
});

describe("callRpcOne", () => {
	it("retorna a primeira linha quando existe", async () => {
		rpcMock.rpc.mockResolvedValue({
			data: [{ total_amount: "10.5" }],
			error: null,
		});

		const row = await callRpcOne<{ total_amount: string }>("total_lancamentos");

		expect(row).toEqual({ total_amount: "10.5" });
	});

	it("retorna null quando não há linhas", async () => {
		rpcMock.rpc.mockResolvedValue({ data: [], error: null });

		await expect(callRpcOne("total_lancamentos")).resolves.toBeNull();
	});
});

describe("snakeToCamel", () => {
	it("converte chaves snake_case em camelCase preservando as demais", () => {
		expect(
			snakeToCamel({ total_amount: "10.5", id: "x", user_id: "u" }),
		).toEqual({ totalAmount: "10.5", id: "x", userId: "u" });
	});

	it("mantém objetos aninhados intactos", () => {
		expect(
			snakeToCamel({
				total_amount: "10.5",
				user: { first_name: "Ada" },
			}),
		).toEqual({ totalAmount: "10.5", user: { first_name: "Ada" } });
	});
});

describe("toRpcNumber", () => {
	it("converte string numérica", () => {
		expect(toRpcNumber("12.34")).toBe(12.34);
	});

	it("usa fallback para null", () => {
		expect(toRpcNumber(null)).toBe(0);
	});

	it("usa fallback para string inválida", () => {
		expect(toRpcNumber("abc", 5)).toBe(5);
	});

	it("mantém números", () => {
		expect(toRpcNumber(12)).toBe(12);
	});
});
