import { describe, expect, it } from "vitest";
import { calculatePercentageChange } from "./math";

describe("calculatePercentageChange", () => {
	it("calcula variação positiva", () => {
		expect(calculatePercentageChange(120, 100)).toBeCloseTo(20);
	});

	it("calcula variação negativa", () => {
		expect(calculatePercentageChange(80, 100)).toBeCloseTo(-20);
	});

	it("retorna null quando ambos são zero", () => {
		expect(calculatePercentageChange(0, 0)).toBeNull();
	});

	it("retorna 100 quando previous é zero e current é positivo", () => {
		expect(calculatePercentageChange(10, 0)).toBe(100);
	});

	it("retorna -100 quando previous é zero e current é negativo", () => {
		expect(calculatePercentageChange(-10, 0)).toBe(-100);
	});

	it("trata valores menores que 1 centavo como zero", () => {
		expect(calculatePercentageChange(0.001, 0.001)).toBeNull();
	});

	it("retorna null para variação absurda (> 1 milhão %)", () => {
		expect(calculatePercentageChange(2000000, 1)).toBeNull();
	});
});
