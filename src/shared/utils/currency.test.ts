import { describe, expect, it } from "vitest";
import {
	formatCurrency,
	formatCurrencyCompact,
	formatDecimalForDbRequired,
	formatInitialBalanceInput,
	formatLimitInput,
	normalizeDecimalInput,
} from "./currency";

describe("formatCurrency", () => {
	it("formata em BRL com 2 decimais", () => {
		expect(formatCurrency(1234.5)).toBe("R$\u00a01.234,50");
	});

	it("formata valor negativo", () => {
		expect(formatCurrency(-12.34)).toBe("-R$\u00a012,34");
	});

	it("respeita maximumFractionDigits", () => {
		expect(
			formatCurrency(1.5, {
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			}),
		).toBe("R$\u00a02");
	});
});

describe("formatCurrencyCompact", () => {
	it("usa notação compacta sem decimais", () => {
		expect(formatCurrencyCompact(1500)).toBe("R$\u00a02\u00a0mil");
	});
});

describe("formatDecimalForDbRequired", () => {
	it("arredonda e fixa em 2 decimais", () => {
		expect(formatDecimalForDbRequired(10.555)).toBe("10.56");
		expect(formatDecimalForDbRequired(10)).toBe("10.00");
	});

	it("arredonda 1.006 para 2 casas", () => {
		expect(formatDecimalForDbRequired(1.006)).toBe("1.01");
	});

	it("mantém 2 casas para valor inteiro", () => {
		expect(formatDecimalForDbRequired(100)).toBe("100.00");
	});
});

describe("normalizeDecimalInput", () => {
	it("troca vírgula por ponto e remove espaços", () => {
		expect(normalizeDecimalInput("1.234,56")).toBe("1.234.56");
		expect(normalizeDecimalInput("10,5")).toBe("10.5");
	});
});

describe("formatLimitInput", () => {
	it("formata com 2 decimais", () => {
		expect(formatLimitInput(5000)).toBe("5000.00");
		expect(formatLimitInput(0)).toBe("0.00");
	});

	it("retorna vazio para valores nulos/NaN", () => {
		expect(formatLimitInput(null)).toBe("");
		expect(formatLimitInput(undefined)).toBe("");
		expect(formatLimitInput(Number.NaN)).toBe("");
	});
});

describe("formatInitialBalanceInput", () => {
	it("formata com 2 decimais", () => {
		expect(formatInitialBalanceInput(100)).toBe("100.00");
	});

	it("usa 0.00 como default para nulos", () => {
		expect(formatInitialBalanceInput(null)).toBe("0.00");
		expect(formatInitialBalanceInput(undefined)).toBe("0.00");
	});
});
