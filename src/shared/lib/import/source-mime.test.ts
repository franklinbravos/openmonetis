import { describe, expect, it } from "vitest";
import {
	isAllowedImportSourceMimeType,
	resolveImportFileMimeType,
} from "./source-mime";

function makeFile(name: string, type = ""): File {
	return new File([""], name, { type });
}

describe("resolveImportFileMimeType", () => {
	it("usa o MIME declarado quando permitido", () => {
		expect(
			resolveImportFileMimeType(makeFile("extrato.pdf", "application/pdf")),
		).toBe("application/pdf");
	});

	it("deriva MIME pela extensão quando o tipo é vazio", () => {
		expect(resolveImportFileMimeType(makeFile("extrato.pdf"))).toBe(
			"application/pdf",
		);
		expect(resolveImportFileMimeType(makeFile("extrato.csv"))).toBe("text/csv");
		expect(resolveImportFileMimeType(makeFile("extrato.txt"))).toBe(
			"text/plain",
		);
		expect(resolveImportFileMimeType(makeFile("extrato.ofx"))).toBe(
			"application/x-ofx",
		);
		expect(resolveImportFileMimeType(makeFile("extrato.qfx"))).toBe(
			"application/x-ofx",
		);
		expect(resolveImportFileMimeType(makeFile("extrato.xlsx"))).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
		expect(resolveImportFileMimeType(makeFile("extrato.xls"))).toBe(
			"application/vnd.ms-excel",
		);
	});

	it("usa octet-stream para extensão desconhecida", () => {
		expect(resolveImportFileMimeType(makeFile("arquivo.bin"))).toBe(
			"application/octet-stream",
		);
	});
});

describe("isAllowedImportSourceMimeType", () => {
	it("aceita MIME da whitelist", () => {
		expect(isAllowedImportSourceMimeType("application/pdf")).toBe(true);
		expect(isAllowedImportSourceMimeType("text/csv")).toBe(true);
	});

	it("rejeita MIME fora da whitelist", () => {
		expect(isAllowedImportSourceMimeType("text/html")).toBe(false);
		expect(isAllowedImportSourceMimeType("")).toBe(false);
	});
});
