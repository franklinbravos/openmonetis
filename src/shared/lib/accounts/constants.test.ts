import { describe, expect, it } from "vitest";
import {
	buildInvoiceAmortizationNote,
	buildInvoicePaymentNote,
	isInvoiceAmortizationNote,
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

	it("ignora nota que não é de pagamento de fatura", () => {
		expect(parseInvoicePaymentNotePeriod("AUTO_REEMBOLSO:abc")).toBeNull();
		expect(parseInvoicePaymentNotePeriod("saldo inicial")).toBeNull();
		expect(parseInvoicePaymentNotePeriod(null)).toBeNull();
		expect(
			parseInvoicePaymentNotePeriod(`AUTO_FATURA:${CARD}:junho`),
		).toBeNull();
	});
});
