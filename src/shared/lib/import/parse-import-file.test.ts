import { describe, expect, it } from "vitest";
import { isSupportedImportFile } from "./parse-import-file";

describe("isSupportedImportFile", () => {
	it("aceita extensões suportadas", () => {
		expect(isSupportedImportFile("extrato.ofx")).toBe(true);
		expect(isSupportedImportFile("extrato.qfx")).toBe(true);
		expect(isSupportedImportFile("extrato.xlsx")).toBe(true);
		expect(isSupportedImportFile("extrato.xls")).toBe(true);
		expect(isSupportedImportFile("extrato.csv")).toBe(true);
		expect(isSupportedImportFile("extrato.txt")).toBe(true);
		expect(isSupportedImportFile("extrato.pdf")).toBe(true);
	});

	it("é case-insensitive", () => {
		expect(isSupportedImportFile("EXTRATO.OFX")).toBe(true);
		expect(isSupportedImportFile("Extrato.Csv")).toBe(true);
	});

	it("rejeita extensões não suportadas", () => {
		expect(isSupportedImportFile("extrato.png")).toBe(false);
		expect(isSupportedImportFile("extrato")).toBe(false);
		expect(isSupportedImportFile("")).toBe(false);
	});
});
