import { describe, expect, it } from "vitest";
import {
	displayInvoiceTotal,
	sumSignedAmountsForImportedTransactions,
} from "./invoice-total";
import { parsePdfText } from "./pdf-parser";

const NUBANK_JAN_2026_FIXTURE = `
Nu Pagamentos S.A.
FATURA 01 JAN 2027
Resumo futuro

FATURA 05 JAN 2026
Vencimento 05 FEV 2026
Total a pagar R$ 150,00

TRANSAÇÕES DE 06 DEZ A 05 JAN
06 DEZ •••• 1234 MERCADO LIVRE R$ 80,00
05 JAN •••• 1234 SPOTIFY R$ 21,90

Pagamentos e Financiamentos
05 FEV Pagamento recebido R$ 150,00
`;

// Fatura real quebra a lista de transações em várias páginas, repetindo
// cabeçalho e rodapé no meio dela.
const NUBANK_PAGE_BREAK_FIXTURE = `
Nu Pagamentos S.A.
FATURA 12 JAN 2026
Vencimento 12 JAN 2026
Total a pagar R$ 103,28

TRANSAÇÕES DE 05 DEZ A 05 JAN
Franklin Santos R$ 103,28
11 DEZ •••• 8058 Amora Semij Art Joalhe R$ 47,00
5 de 7
FRANKLIN DIOGO APARECIDO BRAVOS QUERINO DOS FATURA 12 JAN 2026 EMISSÃO E ENVIO 05 JAN 2026 TRANSAÇÕES DE 05 DEZ A 05 JAN 12 DEZ •••• 8058 Indigo R$ 18,00
22 DEZ •••• 8992 Mercadolivre*2produto R$ 38,28
`;

describe("parseNubankPdf", () => {
	it("usa o cabeçalho FATURA antes de TRANSAÇÕES, não teasers futuros", () => {
		const result = parsePdfText(NUBANK_JAN_2026_FIXTURE);

		expect(result.source).toBe("Nubank");
		expect(result.invoice?.period).toBe("2026-02");
		expect(result.invoice?.dueDate).toBe("2026-02-05");
	});

	it("ajusta o ano das compras de dezembro no ciclo dez–jan", () => {
		const result = parsePdfText(NUBANK_JAN_2026_FIXTURE);

		expect(result.transactions.map((transaction) => transaction.date)).toEqual([
			"2025-12-06",
			"2026-01-05",
		]);
	});

	it("identifica fevereiro/2026 quando o vencimento é em fevereiro", () => {
		const result = parsePdfText(`
Nu Pagamentos S.A.
Vencimento 08 FEV 2026
Total a pagar R$ 50,00
TRANSAÇÕES DE 10 DEZ A 08 JAN
10 DEZ LOJA TESTE R$ 50,00
`);

		expect(result.invoice?.period).toBe("2026-02");
	});

	it("não confunde data de vencimento no cabeçalho FATURA com o mês da fatura", () => {
		const result = parsePdfText(`
Nu Pagamentos S.A.
FATURA 05 FEV 2026
Vencimento 05 FEV 2026
Total a pagar R$ 150,00
TRANSAÇÕES DE 06 DEZ A 05 JAN
05 JAN •••• 1234 SPOTIFY R$ 21,90
`);

		expect(result.invoice?.period).toBe("2026-02");
		expect(result.invoice?.dueDate).toBe("2026-02-05");
	});

	it("lê Período vigente e Data de vencimento do cabeçalho atual", () => {
		const result = parsePdfText(`
Nu Pagamentos S.A.
Data de vencimento: 12 JAN 2026
Período vigente: 05 DEZ a 05 JAN
Total a pagar R$ 150,00

05 DEZ •••• 1234 MERCADO LIVRE R$ 80,00
05 JAN •••• 1234 SPOTIFY R$ 21,90
`);

		expect(result.invoice?.period).toBe("2026-01");
		expect(result.invoice?.dueDate).toBe("2026-01-12");
	});

	it("persiste total do cabeçalho com origem pdf_header", () => {
		const result = parsePdfText(NUBANK_JAN_2026_FIXTURE);

		expect(result.invoice?.totalAmount).toBe(150);
		expect(result.invoice?.totalAmountSource).toBe("pdf_header");
		expect(result.invoice?.isPaid).toBe(false);
	});

	it("total do cabeçalho pode diferir da soma das linhas importáveis", () => {
		const result = parsePdfText(NUBANK_JAN_2026_FIXTURE);
		const linesTotal = displayInvoiceTotal(
			sumSignedAmountsForImportedTransactions(result.transactions),
		);

		expect(result.invoice?.totalAmount).toBe(150);
		expect(linesTotal).toBe(101.9);
	});

	it("não perde a primeira transação depois da quebra de página", () => {
		const result = parsePdfText(NUBANK_PAGE_BREAK_FIXTURE);
		const linesTotal = displayInvoiceTotal(
			sumSignedAmountsForImportedTransactions(result.transactions),
		);

		expect(
			result.transactions.map((t) => `${t.description}|${t.amount}`),
		).toEqual([
			"Amora Semij Art Joalhe|47",
			"Indigo|18",
			"Mercadolivre*2produto|38.28",
		]);
		expect(linesTotal).toBe(result.invoice?.totalAmount);
	});
});
