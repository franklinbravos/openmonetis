import { describe, expect, it } from "vitest";
import { resolvePdfTotalMetadata } from "./invoice-metadata";

describe("resolvePdfTotalMetadata", () => {
	it("prefere cabeçalho quando confere com linhas", () => {
		expect(resolvePdfTotalMetadata(78, 78)).toEqual({
			totalAmount: 78,
			totalAmountSource: "pdf_header",
		});
	});

	it("cai para linhas quando cabeçalho diverge demais", () => {
		expect(resolvePdfTotalMetadata(468, 78)).toEqual({
			totalAmount: 78,
			totalAmountSource: "pdf_lines_fallback",
		});
	});

	it("usa linhas quando cabeçalho ausente", () => {
		expect(resolvePdfTotalMetadata(null, 150)).toEqual({
			totalAmount: 150,
			totalAmountSource: "pdf_lines_fallback",
		});
	});
});
