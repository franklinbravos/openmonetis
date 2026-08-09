import { describe, expect, it } from "vitest";
import { formatBytes, safeToNumber } from "./number";

describe("formatBytes", () => {
	it("formata bytes", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(512)).toBe("512 B");
	});

	it("formata kilobytes", () => {
		expect(formatBytes(1024)).toBe("1.0 KB");
		expect(formatBytes(2048)).toBe("2.0 KB");
	});

	it("formata megabytes", () => {
		expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
	});
});

describe("safeToNumber", () => {
	it("mantém números", () => {
		expect(safeToNumber(42)).toBe(42);
	});

	it("converte strings numéricas", () => {
		expect(safeToNumber("42")).toBe(42);
		expect(safeToNumber("12.5")).toBe(12.5);
	});

	it("usa default para strings inválidas", () => {
		expect(safeToNumber("abc")).toBe(0);
		expect(safeToNumber("abc", 5)).toBe(5);
	});

	it("usa default para null/undefined", () => {
		expect(safeToNumber(null)).toBe(0);
		expect(safeToNumber(undefined, 7)).toBe(7);
	});
});
