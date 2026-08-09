import { describe, expect, it } from "vitest";
import { formatPercentage, formatPercentageChange } from "./percentage";

describe("formatPercentage", () => {
	it("formata com 1 casa por padrão", () => {
		expect(formatPercentage(12.34)).toBe("12,3%");
	});

	it("respeita maximumFractionDigits", () => {
		expect(
			formatPercentage(12.34, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}),
		).toBe("12,34%");
	});

	it("aplica absolute", () => {
		expect(formatPercentage(-5, { absolute: true })).toBe("5%");
	});

	it("aplica signDisplay", () => {
		expect(formatPercentage(5, { signDisplay: "always" })).toBe("+5%");
	});
});

describe("formatPercentageChange", () => {
	it("retorna traço para null", () => {
		expect(formatPercentageChange(null)).toBe("-");
	});

	it("usa 1 casa para valores < 10", () => {
		expect(formatPercentageChange(5)).toBe("+5,0%");
	});

	it("usa 0 casas para valores >= 10", () => {
		expect(formatPercentageChange(-15)).toBe("-15%");
	});

	it("zero com 1 casa (pois < 10)", () => {
		expect(formatPercentageChange(0)).toBe("0,0%");
	});
});
