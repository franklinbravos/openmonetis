import { describe, expect, it } from "vitest";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import {
	allocateInvoicePayments,
	buildPreviousInvoiceReview,
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

describe("buildPreviousInvoiceReview", () => {
	const money = (value: number) => `R$ ${value.toFixed(2)}`;
	const date = (iso: string) => iso.split("-").reverse().join("/");

	it("janeiro já paga e conferindo: tudo ok e nada a mudar", () => {
		// Caso comum. Dizer que a fatura "passa a constar como paga" seria falso —
		// ela já está. Aqui o bloco é conferência, e não há nada para gravar.
		const review = buildPreviousInvoiceReview({
			settlement: resolvePreviousInvoiceSettlement({
				previousTotal: 6003.17,
				carriedOver: 0,
				filePaymentsTotal: 6003.17,
			}),
			registeredStatus: INVOICE_PAYMENT_STATUS.PAID,
			registeredPaymentAmount: 6003.17,
			registeredPaymentDate: "2026-02-12",
			filePaymentDate: "2026-02-12",
			formatMoney: money,
			formatDate: date,
		});

		expect(review.allOk).toBe(true);
		expect(review.hasChanges).toBe(false);
		expect(review.checks.map((check) => check.label)).toEqual([
			"Valor",
			"Situação",
			"Pago em",
		]);
	});

	it("aponta a data divergente sem invalidar o resto", () => {
		const review = buildPreviousInvoiceReview({
			settlement: resolvePreviousInvoiceSettlement({
				previousTotal: 6003.17,
				carriedOver: 0,
				filePaymentsTotal: 6003.17,
			}),
			registeredStatus: INVOICE_PAYMENT_STATUS.PAID,
			registeredPaymentAmount: 6003.17,
			registeredPaymentDate: "2026-02-10",
			filePaymentDate: "2026-02-12",
			formatMoney: money,
			formatDate: date,
		});

		expect(review.allOk).toBe(false);
		const dateCheck = review.checks.find((check) => check.label === "Pago em");
		expect(dateCheck?.ok).toBe(false);
		expect(dateCheck?.detail).toContain("10/02/2026");
		// A data entra no que a confirmação corrige: apontar a divergência sem
		// resolvê-la deixava o usuário sem saída dentro do fluxo.
		expect(review.hasChanges).toBe(true);
		expect(review.changes).toEqual({
			status: false,
			debitAmount: false,
			paymentDate: true,
		});
	});

	it("rotativo: status e débito mudam, então há o que confirmar", () => {
		const review = buildPreviousInvoiceReview({
			settlement: resolvePreviousInvoiceSettlement({
				previousTotal: 6525.24,
				carriedOver: 5525.23,
				filePaymentsTotal: 3500,
			}),
			registeredStatus: INVOICE_PAYMENT_STATUS.PAID,
			registeredPaymentAmount: 6525.24,
			registeredPaymentDate: "2026-05-12",
			filePaymentDate: "2026-05-12",
			formatMoney: money,
			formatDate: date,
		});

		expect(review.hasChanges).toBe(true);
		const statusCheck = review.checks.find(
			(check) => check.label === "Situação",
		);
		expect(statusCheck?.ok).toBe(false);
		expect(statusCheck?.value).toBe("paga parcialmente");
	});

	it("omite o check de data quando o arquivo não traz pagamento datado", () => {
		const review = buildPreviousInvoiceReview({
			settlement: resolvePreviousInvoiceSettlement({
				previousTotal: 1000,
				carriedOver: 900,
				filePaymentsTotal: 100,
			}),
			registeredStatus: INVOICE_PAYMENT_STATUS.PARTIAL,
			registeredPaymentAmount: 100,
			registeredPaymentDate: null,
			filePaymentDate: null,
			formatMoney: money,
			formatDate: date,
		});

		expect(review.checks.map((check) => check.label)).toEqual([
			"Valor",
			"Situação",
		]);
		expect(review.hasChanges).toBe(false);
	});
});

describe("buildPreviousInvoiceReview sem evidência no arquivo", () => {
	const money = (value: number) => `R$ ${value.toFixed(2)}`;
	const date = (iso: string) => iso.split("-").reverse().join("/");

	const semEvidencia = (registeredStatus: string | null) =>
		buildPreviousInvoiceReview({
			settlement: resolvePreviousInvoiceSettlement({
				previousTotal: 10430.51,
				carriedOver: 0,
				filePaymentsTotal: 0,
			}),
			registeredStatus,
			registeredPaymentAmount: 10430.51,
			registeredPaymentDate: "2026-05-12",
			filePaymentDate: null,
			formatMoney: money,
			formatDate: date,
		});

	it("mostra o bloco, sem afirmar pagamento e sem mudar nada", () => {
		// PDF do Nubank não traz a linha de pagamento. A ausência de "valor
		// pendente do mês anterior" indica que nada ficou rolando, mas isso não
		// prova o valor nem a data — então nada é gravado.
		const review = semEvidencia(INVOICE_PAYMENT_STATUS.PAID);

		expect(review.noFileEvidence).toBe(true);
		expect(review.hasChanges).toBe(false);
		expect(review.allOk).toBe(true);
		expect(review.checks.map((check) => check.label)).toEqual([
			"Nada pendente no arquivo",
			"Situação no cadastro",
		]);
	});

	it("alerta quando o cadastro não está como paga", () => {
		const review = semEvidencia(INVOICE_PAYMENT_STATUS.PENDING);

		expect(review.allOk).toBe(false);
		expect(review.hasChanges).toBe(false);
		const statusCheck = review.checks.find(
			(check) => check.label === "Situação no cadastro",
		);
		expect(statusCheck?.detail).toBe("confira se já foi paga");
	});
});

describe("allocateInvoicePayments", () => {
	it("distribui os pagamentos de junho entre maio e a fatura atual", () => {
		// Caso real: pagou R$ 1.000 em 12/05 (vencimento de maio) e R$ 2.500 em
		// 18/05 para reduzir juros. O primeiro liquida o que restava de maio; o
		// segundo amortiza junho.
		const allocation = allocateInvoicePayments({
			payments: [
				{ date: "2026-05-18", amount: 2500 },
				{ date: "2026-05-12", amount: 1000 },
			],
			paidOnPrevious: 1000.01,
		});

		expect(allocation.payments.map((p) => p.date)).toEqual([
			"2026-05-12",
			"2026-05-18",
		]);
		expect(allocation.payments[0].appliedToPrevious).toBe(1000);
		expect(allocation.payments[0].appliedToCurrent).toBe(0);
		expect(allocation.payments[1].appliedToPrevious).toBe(0.01);
		expect(allocation.payments[1].appliedToCurrent).toBe(2499.99);
	});

	it("a data de liquidação é a do pagamento que abateu a anterior", () => {
		// Usar a data do pagamento mais recente acusava divergência onde não há:
		// o débito de maio está gravado em 12/05, que é quando maio foi de fato
		// liquidada — 18/05 é amortização da fatura atual.
		const allocation = allocateInvoicePayments({
			payments: [
				{ date: "2026-05-12", amount: 1000 },
				{ date: "2026-05-18", amount: 2500 },
			],
			paidOnPrevious: 1000,
		});

		expect(allocation.previousSettlementDate).toBe("2026-05-12");
	});

	it("sem nada a abater, tudo amortiza a fatura atual", () => {
		const allocation = allocateInvoicePayments({
			payments: [{ date: "2026-05-18", amount: 2500 }],
			paidOnPrevious: 0,
		});

		expect(allocation.previousSettlementDate).toBeNull();
		expect(allocation.payments[0].appliedToCurrent).toBe(2500);
	});

	it("pagamento único que cobre a anterior inteira", () => {
		const allocation = allocateInvoicePayments({
			payments: [{ date: "2026-04-13", amount: 10430.51 }],
			paidOnPrevious: 10430.51,
		});

		expect(allocation.previousSettlementDate).toBe("2026-04-13");
		expect(allocation.payments[0].appliedToCurrent).toBe(0);
	});

	it("pagamento sem data não quebra a ordenação", () => {
		const allocation = allocateInvoicePayments({
			payments: [
				{ date: null, amount: 100 },
				{ date: "2026-05-12", amount: 200 },
			],
			paidOnPrevious: 250,
		});

		expect(allocation.payments).toHaveLength(2);
		expect(
			allocation.payments.reduce((sum, p) => sum + p.appliedToPrevious, 0),
		).toBe(250);
	});
});
