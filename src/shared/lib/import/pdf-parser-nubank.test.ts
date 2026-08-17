import { describe, expect, it } from "vitest";
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

describe("parseNubankPdf", () => {
	it("usa o cabeçalho FATURA antes de TRANSAÇÕES, não teasers futuros", () => {
		const result = parsePdfText(NUBANK_JAN_2026_FIXTURE);

		expect(result.source).toBe("Nubank");
		expect(result.invoice?.period).toBe("2026-02");
		expect(result.invoice?.dueDate).toBe("2026-02-05");
	});

	it("ajusta o ano das compras de dezembro no ciclo dez–jan", () => {
		const result = parsePdfText(NUBANK_JAN_2026_FIXTURE);

		expect(result.transactions.map((transaction) => transaction.date)).toEqual(
			["2025-12-06", "2026-01-05"],
		);
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
});
