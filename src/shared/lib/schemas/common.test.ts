import { describe, expect, it } from "vitest";
import {
	dayOfMonthSchema,
	noteSchema,
	periodSchema,
	requiredDecimalSchema,
	uuidSchema,
} from "./common";

describe("uuidSchema", () => {
	it("aceita UUID válido", () => {
		const result = uuidSchema("conta").safeParse(
			"123e4567-e89b-12d3-a456-426614174000",
		);
		expect(result.success).toBe(true);
	});

	it("rejeita string não UUID", () => {
		const result = uuidSchema("conta").safeParse("abc");
		expect(result.success).toBe(false);
	});
});

describe("requiredDecimalSchema", () => {
	it("aceita número", () => {
		expect(requiredDecimalSchema("valor").safeParse(100).success).toBe(true);
	});

	it("aceita string com vírgula decimal", () => {
		const result = requiredDecimalSchema("valor").safeParse("1234,56");
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBe(1234.56);
	});

	it("trunca no segundo ponto quando há separador de milhar", () => {
		// Comportamento atual: parseFloat para no segundo ponto ("1.234.56" → 1.234).
		const result = requiredDecimalSchema("valor").safeParse("1.234,56");
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBe(1.234);
	});

	it("rejeita valor não numérico", () => {
		expect(requiredDecimalSchema("valor").safeParse("abc").success).toBe(false);
	});

	it("rejeita valor <= 0", () => {
		expect(requiredDecimalSchema("valor").safeParse(0).success).toBe(false);
		expect(requiredDecimalSchema("valor").safeParse(-5).success).toBe(false);
	});
});

describe("dayOfMonthSchema", () => {
	it("aceita dia válido", () => {
		expect(dayOfMonthSchema.safeParse("15").success).toBe(true);
	});

	it("rejeita dia fora do intervalo", () => {
		expect(dayOfMonthSchema.safeParse("0").success).toBe(false);
		expect(dayOfMonthSchema.safeParse("32").success).toBe(false);
	});
});

describe("periodSchema", () => {
	it("aceita YYYY-MM válido", () => {
		expect(periodSchema.safeParse("2025-11").success).toBe(true);
		expect(periodSchema.safeParse("2025-01").success).toBe(true);
	});

	it("rejeita mês inválido ou formato errado", () => {
		expect(periodSchema.safeParse("2025-13").success).toBe(false);
		expect(periodSchema.safeParse("2025-1").success).toBe(false);
		expect(periodSchema.safeParse("2025").success).toBe(false);
		expect(periodSchema.safeParse("").success).toBe(false);
	});
});

describe("noteSchema", () => {
	it("aceita string e trim", () => {
		const result = noteSchema.safeParse("  anotação  ");
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBe("anotação");
	});

	it("converte string vazia em null", () => {
		const result = noteSchema.safeParse("   ");
		expect(result.success).toBe(true);
		if (result.success) expect(result.data).toBeNull();
	});

	it("aceita null e undefined", () => {
		expect(noteSchema.safeParse(null).success).toBe(true);
		expect(noteSchema.safeParse(undefined).success).toBe(true);
	});

	it("rejeita acima de 500 caracteres", () => {
		expect(noteSchema.safeParse("a".repeat(501)).success).toBe(false);
	});
});
