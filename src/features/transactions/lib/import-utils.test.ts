import { describe, expect, it } from "vitest";
import {
	isTruncatedDescriptionMatch,
	normalizeDescriptionKey,
} from "./import-utils";

describe("normalizeDescriptionKey", () => {
	it("normaliza espaços e caixa", () => {
		expect(normalizeDescriptionKey("  Foo   Bar  ")).toBe("foo bar");
	});

	it("retorna string vazia para valores ausentes", () => {
		expect(normalizeDescriptionKey(undefined)).toBe("");
		expect(normalizeDescriptionKey(null)).toBe("");
	});
});

describe("isTruncatedDescriptionMatch", () => {
	it("aceita prefixo truncado", () => {
		expect(
			isTruncatedDescriptionMatch("mercado extra", "mercado extra hiper"),
		).toBe(true);
	});

	it("ignora chaves ausentes", () => {
		expect(isTruncatedDescriptionMatch("mercado extra", undefined)).toBe(false);
		expect(isTruncatedDescriptionMatch("", "mercado extra")).toBe(false);
	});
});
