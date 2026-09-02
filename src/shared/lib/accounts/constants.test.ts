import { describe, expect, it } from "vitest";
import {
	buildInvoiceAmortizationNote,
	buildInvoicePaymentNote,
	isAccountBalanceAdjustmentName,
	isInvoiceAmortizationNote,
	parseInvoicePaymentNoteCardId,
	parseInvoicePaymentNotePeriod,
} from "@/shared/lib/accounts/constants";

const CARD = "23233748-6eed-472f-9ffc-9fde3a5502c9";

describe("notas de pagamento de fatura", () => {
	it("a amortização estende a nota do pagamento, então o prefixo acha as duas", () => {
		const main = buildInvoicePaymentNote(CARD, "2026-06");
		const amortization = buildInvoiceAmortizationNote(
			CARD,
			"2026-06",
			"2026-05-18",
		);

		expect(amortization.startsWith(main)).toBe(true);
		expect(isInvoiceAmortizationNote(amortization)).toBe(true);
		expect(isInvoiceAmortizationNote(main)).toBe(false);
	});

	it("o período vem da nota, não da coluna do lançamento", () => {
		// A amortização de 18/05 pertence à fatura de junho, apesar de o dinheiro
		// ter saído em maio.
		expect(
			parseInvoicePaymentNotePeriod(
				buildInvoiceAmortizationNote(CARD, "2026-06", "2026-05-18"),
			),
		).toBe("2026-06");
		expect(
			parseInvoicePaymentNotePeriod(buildInvoicePaymentNote(CARD, "2026-06")),
		).toBe("2026-06");
	});

	it("o cartão também vem da nota — a coluna do pagamento é nula", () => {
		// O pagamento sai da conta corrente, então `cartao_id` não diz nada. Quem
		// aponta a fatura liquidada é a anotação.
		expect(
			parseInvoicePaymentNoteCardId(buildInvoicePaymentNote(CARD, "2026-06")),
		).toBe(CARD);
		expect(
			parseInvoicePaymentNoteCardId(
				buildInvoiceAmortizationNote(CARD, "2026-06", "2026-05-18"),
			),
		).toBe(CARD);
		expect(parseInvoicePaymentNoteCardId("AUTO_REEMBOLSO:abc")).toBeNull();
		expect(parseInvoicePaymentNoteCardId(null)).toBeNull();
	});

	it("a nota continua legível com o nome do extrato anexado", () => {
		// A importação anexa uma linha com o nome original. Lida por `split(":")`,
		// o período saía como "2026-01\nExtrato" e o pagamento ficava invisível
		// para a fatura — foi o que sumiu com R$ 6.003,17 de janeiro.
		const comExtrato = `${buildInvoicePaymentNote(CARD, "2026-01")}\nExtrato: Pagamento de fatura`;

		expect(parseInvoicePaymentNotePeriod(comExtrato)).toBe("2026-01");
		expect(parseInvoicePaymentNoteCardId(comExtrato)).toBe(CARD);

		const amortizacaoComExtrato = `${buildInvoiceAmortizationNote(CARD, "2026-05", "2026-05-18")}\nExtrato: Pagamento de fatura`;

		expect(parseInvoicePaymentNotePeriod(amortizacaoComExtrato)).toBe(
			"2026-05",
		);
		expect(parseInvoicePaymentNoteCardId(amortizacaoComExtrato)).toBe(CARD);
	});

	it("ignora nota que não é de pagamento de fatura", () => {
		expect(parseInvoicePaymentNotePeriod("AUTO_REEMBOLSO:abc")).toBeNull();
		expect(parseInvoicePaymentNotePeriod("saldo inicial")).toBeNull();
		expect(parseInvoicePaymentNotePeriod(null)).toBeNull();
		expect(
			parseInvoicePaymentNotePeriod(`AUTO_FATURA:${CARD}:junho`),
		).toBeNull();
	});
});

describe("ajuste de saldo", () => {
	it("é reconhecido pelo nome, inclusive nos que já estavam gravados", () => {
		// Casa pelo nome porque a anotação do ajuste é texto humano ("O saldo era
		// X mas o correto é Y"), diferente a cada gravação.
		expect(isAccountBalanceAdjustmentName("Ajuste de saldo")).toBe(true);
		expect(isAccountBalanceAdjustmentName("  ajuste de saldo  ")).toBe(true);
		expect(isAccountBalanceAdjustmentName("AJUSTE DE SALDO")).toBe(true);
	});

	it("não confunde com lançamento de verdade", () => {
		expect(isAccountBalanceAdjustmentName("Ajuste de saldo devedor")).toBe(
			false,
		);
		expect(isAccountBalanceAdjustmentName("Saldo inicial")).toBe(false);
		expect(isAccountBalanceAdjustmentName(null)).toBe(false);
		expect(isAccountBalanceAdjustmentName("")).toBe(false);
	});
});
