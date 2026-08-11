import { describe, expect, it } from "vitest";
import { fixUtf8Mojibake } from "./string";

describe("fixUtf8Mojibake", () => {
	it("corrige acentos corrompidos por leitura Latin-1 de UTF-8", () => {
		expect(fixUtf8Mojibake("Compra no dÃ©bito - VILA MAIS SUPERMERCADO")).toBe(
			"Compra no débito - VILA MAIS SUPERMERCADO",
		);
	});

	it("mantém texto já correto", () => {
		expect(fixUtf8Mojibake("Compra no débito - MERCADO")).toBe(
			"Compra no débito - MERCADO",
		);
	});
});
