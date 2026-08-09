import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf, parsePdfText } from "./pdf-parser";

const ITAU_SAMPLE_FIXTURE = `
Itaú cartão final 1234
SAMSUNG ITAUCARD
Vencimento 09/08/2026
Total desta fatura R$ 1.234,56

Lançamentos: compras e saques
FRANKLIN (1234)
DATA ESTABELECIMENTO VALOR EM R$
07/07 MERCADO LIVRE*MERCADOL 150,00
08/07 SPOTIFY 21,90
15/07 POSTO IPIRANGA 09/12 320,00
Total dos lançamentos atuais R$ 491,90

Lançamentos: produtos e serviços
FRANKLIN (1234)
22/07 ANUIDADE DIFERENCIADA 12/12 45,00
Total dos lançamentos atuais R$ 45,00

Compras parceladas - próximas faturas
`;

describe("parseItauCardPdf", () => {
	it("reconhece fatura Itaú Samsung e extrai lançamentos", () => {
		const result = parsePdfText(ITAU_SAMPLE_FIXTURE);

		expect(result.source).toBe("Itaú");
		expect(result.isCreditCard).toBe(true);
		expect(result.transactions).toHaveLength(4);
		expect(result.transactions[0]).toMatchObject({
			date: "2026-07-07",
			description: "MERCADO LIVRE*MERCADOL",
			amount: 150,
			transactionType: "expense",
		});
		expect(result.transactions[2]?.description).toContain("POSTO IPIRANGA");
		expect(result.invoice?.dueDate).toBe("2026-08-09");
		expect(result.invoice?.period).toBe("2026-08");
	});

	it("importa PDF de amostra local quando disponível", async () => {
		const samplePath = join(
			process.cwd(),
			"samples/finance/faturas/Fatura_Itau_20260809-130820.pdf",
		);
		if (!existsSync(samplePath)) return;

		const buffer = readFileSync(samplePath);
		const data = new Uint8Array(
			buffer.buffer,
			buffer.byteOffset,
			buffer.byteLength,
		);
		const result = await parsePdf(data.buffer);

		expect(result.source).toBe("Itaú");
		expect(result.isCreditCard).toBe(true);
		expect(result.transactions.length).toBeGreaterThan(0);
		expect(result.invoice?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
