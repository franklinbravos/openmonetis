import { describe, expect, it } from "vitest";
import {
	parseNubankInvoiceSummary,
	sliceNubankSummaryBlock,
} from "./nubank-summary";

/*
 * Fixtures reais das faturas de junho, julho e agosto de 2026.
 *
 * Estão no formato que `extractPdfText` produz: uma página vira uma linha só,
 * itens de texto colados com espaço. Nada de `\n` dentro do bloco — é justamente
 * por isso que o parser não pode usar âncora de linha.
 */

const JUNHO = ` FATURA 12 JUN 2026 RESUMO DA FATURA ATUAL Fatura anterior   R$ 6.525,24 Pagamento recebido   −R$ 3.500,00 Saldo financiado   R$ 3.025,23 Juros de financiamento   R$ 575,40 IOF de financiamento   R$ 35,26 Total de compras de todos os cartões, 05 MAI a 05 JUN   R$ 4.174,50 Outros lançamentos   R$ 167,75  Total a pagar   R$ 7.978,15  Pagamento mínimo para não ficar em atraso   R$ 1.196,72 `;

const JULHO = ` FATURA 12 JUL 2026 RESUMO DA FATURA ATUAL Fatura anterior   R$ 7.978,15 Pagamento recebido   −R$ 1.715,79 Crédito de parcelamento   −R$ 6.262,36 Estorno de juros   −R$ 16,60 Total de compras de todos os cartões, 05 JUN a 05 JUL   R$ 2.033,60 Outros lançamentos   R$ 92,50  Total a pagar   R$ 2.109,50  Pagamento mínimo para não ficar em atraso   R$ 323,82 `;

const AGOSTO = ` FATURA 12 AGO 2026 RESUMO DA FATURA ATUAL Fatura anterior   R$ 2.109,50 Pagamento recebido   −R$ 2.109,50 Total de compras de todos os cartões, 05 JUL a 05 AGO   R$ 2.542,44 Outros lançamentos   R$ 128,46  Total a pagar   R$ 2.670,90  Pagamento mínimo para não ficar em atraso   R$ 2.199,45 `;

describe("parseNubankInvoiceSummary", () => {
	it("as três faturas reais fecham ao centavo", () => {
		for (const [nome, texto, total] of [
			["junho", JUNHO, 7978.15],
			["julho", JULHO, 2109.5],
			["agosto", AGOSTO, 2670.9],
		] as const) {
			const ledger = parseNubankInvoiceSummary(texto);
			expect(ledger, nome).not.toBeNull();
			expect(ledger?.totalDue, nome).toBe(total);
			expect(ledger?.balances, nome).toBe(true);
			expect(Math.abs(ledger?.residual ?? 1), nome).toBeLessThanOrEqual(0.02);
		}
	});

	it("junho: saldo financiado é informativo e não entra na soma", () => {
		// Somar o saldo financiado erraria junho em R$ 3.025,23 — ele é derivado
		// (`anterior − pagamento`), não um componente.
		const ledger = parseNubankInvoiceSummary(JUNHO);

		expect(ledger?.financedBalance).toBe(3025.23);
		expect(ledger?.financingCharges).toBe(610.66);
		expect(ledger?.balances).toBe(true);
	});

	it("julho: lê os dois créditos que o app ignorava", () => {
		const ledger = parseNubankInvoiceSummary(JULHO);

		expect(ledger?.paymentsReceived).toBe(1715.79);
		expect(ledger?.credits).toEqual([
			{ label: "Crédito de parcelamento", amount: 6262.36 },
			{ label: "Estorno de juros", amount: 16.6 },
		]);
	});

	it("agosto: pagamento cancela a fatura anterior", () => {
		const ledger = parseNubankInvoiceSummary(AGOSTO);

		expect(ledger?.previousInvoice).toBe(2109.5);
		expect(ledger?.paymentsReceived).toBe(2109.5);
		expect(ledger?.credits).toEqual([]);
		expect(ledger?.purchases).toBe(2542.44);
		expect(ledger?.otherEntries).toBe(128.46);
	});

	it("um centavo de diferença ainda fecha; cinquenta não", () => {
		const umCentavo = AGOSTO.replace("R$ 2.670,90", "R$ 2.670,91");
		expect(parseNubankInvoiceSummary(umCentavo)?.balances).toBe(true);

		const cinquenta = AGOSTO.replace("R$ 2.670,90", "R$ 2.671,40");
		const ledger = parseNubankInvoiceSummary(cinquenta);
		expect(ledger?.balances).toBe(false);
		expect(ledger?.residual).toBe(-0.5);
	});

	it("soma todas as ocorrências de pagamento recebido", () => {
		// Mês com dois pagamentos é caso real; hoje o parser lê só o primeiro.
		const doisPagamentos = AGOSTO.replace(
			"Pagamento recebido   −R$ 2.109,50",
			"Pagamento recebido   −R$ 1.000,00 Pagamento recebido   −R$ 1.109,50",
		);
		const ledger = parseNubankInvoiceSummary(doisPagamentos);

		expect(ledger?.paymentsReceived).toBe(2109.5);
		expect(ledger?.balances).toBe(true);
	});

	it("aceita menos ASCII e menos Unicode", () => {
		const asciiMinus = JULHO.replace(/−/g, "-");
		expect(parseNubankInvoiceSummary(asciiMinus)?.balances).toBe(true);

		const enDash = JULHO.replace(/−/g, "–");
		expect(parseNubankInvoiceSummary(enDash)?.balances).toBe(true);
	});

	it("o Total a pagar do boleto não vence o do resumo", () => {
		// O Nubank imprime esse rótulo também fora do resumo. Antes do recorte, a
		// primeira ocorrência do documento ganhava.
		const comBoleto = ` Total a pagar   R$ 99.999,99 vencimento 12 AGO ${AGOSTO}`;
		const ledger = parseNubankInvoiceSummary(comBoleto);

		expect(ledger?.totalDue).toBe(2670.9);
		expect(ledger?.balances).toBe(true);
	});

	it("para no fim do bloco e não lê a seção seguinte", () => {
		const comTransacoes = `${AGOSTO} TRANSAÇÕES DE 05 JUL A 05 AGO 05 JUL Shopping Center Iguate   R$ 32,20 Total a pagar   R$ 1,00 `;
		const ledger = parseNubankInvoiceSummary(comTransacoes);

		expect(ledger?.totalDue).toBe(2670.9);
	});

	it("sem o bloco, devolve null em vez de adivinhar", () => {
		expect(parseNubankInvoiceSummary("Fatura Nubank sem resumo")).toBeNull();
		expect(parseNubankInvoiceSummary("")).toBeNull();
	});
});

describe("sliceNubankSummaryBlock", () => {
	it("recorta do cabeçalho até o pagamento mínimo", () => {
		const slice = sliceNubankSummaryBlock(AGOSTO);

		expect(slice).toContain("Fatura anterior");
		expect(slice).toContain("Total a pagar");
		expect(slice).not.toContain("Pagamento mínimo");
	});

	it("sem cabeçalho, não recorta nada", () => {
		expect(sliceNubankSummaryBlock("qualquer coisa")).toBeNull();
	});
});
