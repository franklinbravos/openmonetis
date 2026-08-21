import { describe, expect, it } from "vitest";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import {
	isInvoiceRolloverCarryDescription,
	isInvoiceRolloverChargeDescription,
	resolvePreviousInvoiceSettlement,
	sumInvoiceRolloverCarry,
	sumInvoiceRolloverCharges,
} from "./invoice-rollover";

describe("reconhecimento das linhas do rotativo", () => {
	it("identifica o carrego da fatura anterior", () => {
		expect(
			isInvoiceRolloverCarryDescription(
				"Valor pendente do mês anterior (rotativo)",
			),
		).toBe(true);
		expect(isInvoiceRolloverCarryDescription("Boa Supermercados")).toBe(false);
	});

	it("identifica juros e IOF do rotativo", () => {
		expect(
			isInvoiceRolloverChargeDescription(
				"Juros de pagamento parcial da fatura (rotativo)",
			),
		).toBe(true);
		expect(
			isInvoiceRolloverChargeDescription(
				"IOF de pagamento parcial da fatura (rotativo)",
			),
		).toBe(true);
		expect(isInvoiceRolloverChargeDescription("Contabilizei Tecnologi")).toBe(
			false,
		);
	});

	it("soma carrego e encargos separadamente", () => {
		const rows = [
			{
				description: "Valor pendente do mês anterior (rotativo)",
				amount: 5525.23,
			},
			{
				description: "Juros de pagamento parcial da fatura (rotativo)",
				amount: 575.4,
			},
			{
				description: "IOF de pagamento parcial da fatura (rotativo)",
				amount: 35.26,
			},
			{ description: "Boa Supermercados", amount: 183.35 },
		];

		expect(sumInvoiceRolloverCarry(rows)).toBe(5525.23);
		expect(sumInvoiceRolloverCharges(rows)).toBe(610.66);
	});
});

describe("resolvePreviousInvoiceSettlement", () => {
	it("deduz o pago de maio a partir do que rolou para junho", () => {
		// Números reais: maio fechou em 6.525,24 e junho trouxe 5.525,23 de
		// pendente. A diferença é o que foi pago — 1.000,01, contra uma linha de
		// pagamento de 1.000,00 no arquivo. O resto dos 3.500 pagos amortiza junho.
		const settlement = resolvePreviousInvoiceSettlement({
			previousTotal: 6525.24,
			carriedOver: 5525.23,
			filePaymentsTotal: 3500,
		});

		expect(settlement.paidOnPrevious).toBe(1000.01);
		expect(settlement.paymentStatus).toBe(INVOICE_PAYMENT_STATUS.PARTIAL);
		expect(settlement.amortizationOnCurrent).toBe(2499.99);
	});

	it("sem carrego, com pagamento, a anterior foi quitada e a conta fecha", () => {
		// Caso comum: fevereiro quitou janeiro por inteiro. A validação útil aqui
		// é o pagamento do arquivo bater com o total cadastrado da anterior.
		const settlement = resolvePreviousInvoiceSettlement({
			previousTotal: 6003.17,
			carriedOver: 0,
			filePaymentsTotal: 6003.17,
		});

		expect(settlement.paidOnPrevious).toBe(6003.17);
		expect(settlement.paymentStatus).toBe(INVOICE_PAYMENT_STATUS.PAID);
		expect(settlement.amortizationOnCurrent).toBe(0);
		expect(settlement.reconcilesWithPreviousTotal).toBe(true);
	});

	it("aponta divergência quando o pago não fecha com o total cadastrado", () => {
		// O arquivo diz que se pagou 6.000, mas a fatura anterior soma 6.500:
		// falta lançamento no mês passado, ou algum valor está errado.
		const settlement = resolvePreviousInvoiceSettlement({
			previousTotal: 6500,
			carriedOver: 0,
			filePaymentsTotal: 6000,
		});

		expect(settlement.paymentStatus).toBe(INVOICE_PAYMENT_STATUS.PAID);
		expect(settlement.reconcilesWithPreviousTotal).toBe(false);
	});

	it("pagamento acima do total da anterior amortiza a atual", () => {
		const settlement = resolvePreviousInvoiceSettlement({
			previousTotal: 1000,
			carriedOver: 0,
			filePaymentsTotal: 1500,
		});

		expect(settlement.paidOnPrevious).toBe(1000);
		expect(settlement.amortizationOnCurrent).toBe(500);
	});

	it("sem carrego e sem pagamento, o arquivo não afirma nada", () => {
		// Ausência de rotativo não prova quitação: pode ser fatura ainda em
		// aberto. Sem evidência, nada deve ser escrito na fatura anterior.
		const settlement = resolvePreviousInvoiceSettlement({
			previousTotal: 6003.17,
			carriedOver: 0,
			filePaymentsTotal: 0,
		});

		expect(settlement.paymentStatus).toBeNull();
		expect(settlement.paidOnPrevious).toBe(0);
	});

	it("carrego igual ao total significa que nada foi pago", () => {
		const settlement = resolvePreviousInvoiceSettlement({
			previousTotal: 5000,
			carriedOver: 5000,
			filePaymentsTotal: 0,
		});

		expect(settlement.paidOnPrevious).toBe(0);
		expect(settlement.paymentStatus).toBe(INVOICE_PAYMENT_STATUS.PENDING);
	});

	it("carrego maior que o total não gera pago negativo", () => {
		// Juros podem fazer o pendente passar do total da fatura anterior.
		const settlement = resolvePreviousInvoiceSettlement({
			previousTotal: 1000,
			carriedOver: 1200,
			filePaymentsTotal: 0,
		});

		expect(settlement.paidOnPrevious).toBe(0);
		expect(settlement.paymentStatus).toBe(INVOICE_PAYMENT_STATUS.PENDING);
		expect(settlement.amortizationOnCurrent).toBe(0);
	});

	it("um centavo de carrego não caracteriza rotativo", () => {
		const settlement = resolvePreviousInvoiceSettlement({
			previousTotal: 1000,
			carriedOver: 0.01,
			filePaymentsTotal: 1000,
		});

		expect(settlement.paymentStatus).toBe(INVOICE_PAYMENT_STATUS.PAID);
		expect(settlement.reconcilesWithPreviousTotal).toBe(true);
	});
});
