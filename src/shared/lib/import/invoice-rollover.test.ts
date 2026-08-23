import { describe, expect, it } from "vitest";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import {
	allocateInvoicePayments,
	applyRolloverCarryCorrectionToFileRows,
	buildPreviousInvoiceReview,
	collectInvoiceAmortizations,
	invoiceAmortizationsDiffer,
	isInvoiceRolloverCarryDescription,
	isInvoiceRolloverChargeDescription,
	resolvePreviousInvoiceSettlement,
	resolveRolloverCarryFromFile,
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
			"Pago no mês",
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
			"Pago no mês",
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
		// O centavo que falta para os 1.000,01 apurados é arredondamento do banco,
		// e fica no pagamento que o originou: buscá-lo aqui faria a amortização
		// registrada sair como 2.499,99.
		expect(allocation.payments[1].appliedToPrevious).toBe(0);
		expect(allocation.payments[1].appliedToCurrent).toBe(2500);
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

describe("valor exibido na conferência", () => {
	const money = (value: number) => `R$ ${value.toFixed(2)}`;
	const date = (iso: string) => iso.split("-").reverse().join("/");

	it("mostra o total pago no mês, não só a parte que abateu a anterior", () => {
		// Junho: pagou R$ 3.500 no mês, dos quais R$ 1.000,01 fecharam maio. O
		// número aqui é o total — a divisão aparece na lista de pagamentos.
		const review = buildPreviousInvoiceReview({
			settlement: resolvePreviousInvoiceSettlement({
				previousTotal: 6525.24,
				carriedOver: 5525.23,
				filePaymentsTotal: 3500,
			}),
			registeredStatus: INVOICE_PAYMENT_STATUS.PARTIAL,
			registeredPaymentAmount: 1000.01,
			registeredPaymentDate: "2026-05-12",
			filePaymentDate: "2026-05-12",
			formatMoney: money,
			formatDate: date,
		});

		const paid = review.checks.find((check) => check.label === "Pago no mês");
		expect(paid?.value).toBe(money(3500));
	});

	it("sem pagamento no arquivo, cai no valor apurado pelo carrego", () => {
		const review = buildPreviousInvoiceReview({
			settlement: resolvePreviousInvoiceSettlement({
				previousTotal: 1000,
				carriedOver: 900,
				filePaymentsTotal: 0,
			}),
			registeredStatus: INVOICE_PAYMENT_STATUS.PARTIAL,
			registeredPaymentAmount: 100,
			registeredPaymentDate: null,
			filePaymentDate: null,
			formatMoney: money,
			formatDate: date,
		});

		const paid = review.checks.find((check) => check.label === "Pago no mês");
		expect(paid?.value).toBe(money(100));
	});
});

describe("collectInvoiceAmortizations", () => {
	it("junta por data o que abateu a fatura atual", () => {
		const { payments } = allocateInvoicePayments({
			payments: [
				{ date: "2026-05-12", amount: 1000 },
				{ date: "2026-05-18", amount: 2500 },
			],
			paidOnPrevious: 1000.01,
		});

		expect(collectInvoiceAmortizations(payments)).toEqual([
			{ date: "2026-05-18", amount: 2500 },
		]);
	});

	it("divide o pagamento que abateu as duas faturas", () => {
		const { payments } = allocateInvoicePayments({
			payments: [{ date: "2026-05-12", amount: 3000 }],
			paidOnPrevious: 1000,
		});

		expect(collectInvoiceAmortizations(payments)).toEqual([
			{ date: "2026-05-12", amount: 2000 },
		]);
	});

	it("ignora pagamento sem data, que não tem como ser reconhecido depois", () => {
		const { payments } = allocateInvoicePayments({
			payments: [{ date: null, amount: 500 }],
			paidOnPrevious: 0,
		});

		expect(collectInvoiceAmortizations(payments)).toEqual([]);
	});

	it("não devolve nada quando os pagamentos só cobrem a fatura anterior", () => {
		const { payments } = allocateInvoicePayments({
			payments: [{ date: "2026-05-12", amount: 1000 }],
			paidOnPrevious: 1000,
		});

		expect(collectInvoiceAmortizations(payments)).toEqual([]);
	});
});

describe("invoiceAmortizationsDiffer", () => {
	const file = [{ date: "2026-05-18", amount: 2500 }];

	it("reprocessar o mesmo arquivo não pede confirmação", () => {
		expect(invoiceAmortizationsDiffer(file, [...file])).toBe(false);
	});

	it("absorve o centavo de arredondamento do banco", () => {
		expect(
			invoiceAmortizationsDiffer(file, [
				{ date: "2026-05-18", amount: 2500.01 },
			]),
		).toBe(false);
	});

	it("aponta diferença quando nada está registrado", () => {
		expect(invoiceAmortizationsDiffer(file, [])).toBe(true);
	});

	it("aponta diferença quando a data registrada é outra", () => {
		expect(
			invoiceAmortizationsDiffer(file, [{ date: "2026-06-12", amount: 2500 }]),
		).toBe(true);
	});

	it("aponta diferença quando o valor registrado é outro", () => {
		expect(
			invoiceAmortizationsDiffer(file, [{ date: "2026-05-18", amount: 1200 }]),
		).toBe(true);
	});
});

describe("resolveRolloverCarryFromFile", () => {
	it("abate do carrego o pagamento que chegou depois do vencimento", () => {
		// Junho/2026: OFX declara carrego de 5.525,23 (12/05) e total de 7.978,14,
		// mas suas linhas somam 10.478,14. A diferença é o pagamento de 18/05, e o
		// resumo do banco confirma o saldo financiado de 3.025,23.
		expect(
			resolveRolloverCarryFromFile({
				carryFromFile: 5525.23,
				declaredTotal: 7978.14,
				fileRowsTotal: 10478.14,
			}),
		).toEqual({ carriedOver: 3025.23, paidAfterCarry: 2500 });
	});

	it("não mexe no carrego quando o arquivo fecha com o próprio total", () => {
		expect(
			resolveRolloverCarryFromFile({
				carryFromFile: 5525.23,
				declaredTotal: 10478.14,
				fileRowsTotal: 10478.14,
			}),
		).toEqual({ carriedOver: 5525.23, paidAfterCarry: 0 });
	});

	it("absorve o centavo de arredondamento sem inventar pagamento", () => {
		expect(
			resolveRolloverCarryFromFile({
				carryFromFile: 5525.23,
				declaredTotal: 10478.13,
				fileRowsTotal: 10478.14,
			}),
		).toEqual({ carriedOver: 5525.23, paidAfterCarry: 0 });
	});

	it("não mascara sobra maior que o carrego, que tem outra causa", () => {
		expect(
			resolveRolloverCarryFromFile({
				carryFromFile: 1000,
				declaredTotal: 5000,
				fileRowsTotal: 8000,
			}),
		).toEqual({ carriedOver: 1000, paidAfterCarry: 0 });
	});

	it("sem carrego não há o que ajustar", () => {
		expect(
			resolveRolloverCarryFromFile({
				carryFromFile: 0,
				declaredTotal: 7978.14,
				fileRowsTotal: 10478.14,
			}),
		).toEqual({ carriedOver: 0, paidAfterCarry: 0 });
	});

	it("sem total declarado, o arquivo não permite a conta", () => {
		expect(
			resolveRolloverCarryFromFile({
				carryFromFile: 5525.23,
				declaredTotal: null,
				fileRowsTotal: 10478.14,
			}),
		).toEqual({ carriedOver: 5525.23, paidAfterCarry: 0 });
	});
});

describe("applyRolloverCarryCorrectionToFileRows", () => {
	const juneRows = () => [
		{
			date: "2026-05-12",
			amount: -5525.23,
			description: "Valor pendente do mês anterior (rotativo)",
			externalId:
				"2026-05-12|5525.23|valor pendente do mês anterior (rotativo)",
		},
		{
			date: "2026-06-02",
			amount: -575.4,
			description: "Juros de pagamento parcial da fatura (rotativo)",
			externalId: null,
		},
		{
			date: "2026-06-02",
			amount: -35.26,
			description: "IOF de pagamento parcial da fatura (rotativo)",
			externalId: null,
		},
		{
			date: "2026-06-01",
			amount: -4342.25,
			description: "Compras",
			externalId: null,
		},
	];

	it("corrige o valor da linha e o id sintético junto", () => {
		const result = applyRolloverCarryCorrectionToFileRows(juneRows(), 7978.14);

		expect(result.paidAfterCarry).toBe(2500);
		expect(result.transactions[0]).toMatchObject({
			amount: -3025.23,
			externalId:
				"2026-05-12|3025.23|valor pendente do mês anterior (rotativo)",
		});
		// A soma das linhas passa a fechar com o total que o banco manda pagar.
		expect(
			result.transactions.reduce((sum, row) => sum + Math.abs(row.amount), 0),
		).toBeCloseTo(7978.14, 2);
	});

	it("não mexe em nada quando o arquivo já fecha", () => {
		const rows = juneRows();
		const result = applyRolloverCarryCorrectionToFileRows(rows, 10478.14);

		expect(result.paidAfterCarry).toBe(0);
		expect(result.transactions).toBe(rows);
	});

	it("preserva id do banco, que não embute valor", () => {
		const rows = juneRows();
		rows[0].externalId = "NUBANK-FITID-123";
		const result = applyRolloverCarryCorrectionToFileRows(rows, 7978.14);

		expect(result.transactions[0].externalId).toBe("NUBANK-FITID-123");
		expect(result.transactions[0].amount).toBe(-3025.23);
	});

	it("com duas linhas de carrego não adivinha a divisão", () => {
		const rows = [
			...juneRows(),
			{
				date: "2026-05-12",
				amount: -100,
				description: "Valor pendente do mês anterior (rotativo)",
				externalId: null,
			},
		];

		expect(applyRolloverCarryCorrectionToFileRows(rows, 7978.14)).toMatchObject(
			{ paidAfterCarry: 0 },
		);
	});
});
