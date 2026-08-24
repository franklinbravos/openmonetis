import { describe, expect, it } from "vitest";
import {
	buildInstallmentOccurrenceKey,
	buildInstallmentSeriesKey,
	getInstallmentBasePeriod,
	resolveInstallmentPurchaseDate,
} from "@/features/transactions/lib/import-installments";

describe("buildInstallmentOccurrenceKey", () => {
	it("reconhece a mesma ocorrência com o nome escrito das duas formas", () => {
		// O cadastro guarda o nome base; o arquivo traz o nome com o sufixo.
		const doCadastro = buildInstallmentOccurrenceKey({
			name: "Mlp*Magalu-Click Pisci",
			period: "2026-02",
			currentInstallment: 1,
			installmentCount: 2,
		});
		const doArquivo = buildInstallmentOccurrenceKey({
			name: "Mlp*Magalu-Click Pisci - Parcela 1/2",
			period: "2026-02",
			currentInstallment: 1,
			installmentCount: 2,
		});

		expect(doCadastro).toBe(doArquivo);
	});

	it("ignora diferença de centavo: mesma parcela, mesmo mês", () => {
		// O valor fica fora da chave de propósito — o banco arredonda parcela
		// diferente entre faturas e ainda é a mesma ocorrência.
		const key = buildInstallmentOccurrenceKey({
			name: "Mlp*Magalu-Click Pisci",
			period: "2026-02",
			currentInstallment: 1,
			installmentCount: 2,
		});

		expect(key).toBe("mlp*magalu-click pisci|2026-02|1|2");
	});

	it("separa parcelas diferentes da mesma série", () => {
		const parcela1 = buildInstallmentOccurrenceKey({
			name: "Centauro",
			period: "2026-02",
			currentInstallment: 1,
			installmentCount: 5,
		});
		const parcela2 = buildInstallmentOccurrenceKey({
			name: "Centauro",
			period: "2026-03",
			currentInstallment: 2,
			installmentCount: 5,
		});

		expect(parcela1).not.toBe(parcela2);
	});

	it("separa a mesma parcela em meses diferentes", () => {
		const emFevereiro = buildInstallmentOccurrenceKey({
			name: "Centauro",
			period: "2026-02",
			currentInstallment: 3,
			installmentCount: 5,
		});
		const emMarco = buildInstallmentOccurrenceKey({
			name: "Centauro",
			period: "2026-03",
			currentInstallment: 3,
			installmentCount: 5,
		});

		expect(emFevereiro).not.toBe(emMarco);
	});

	it("normaliza espaços e caixa do nome", () => {
		expect(
			buildInstallmentOccurrenceKey({
				name: "  Leroy   MERLIN ",
				period: "2026-03",
				currentInstallment: 2,
				installmentCount: 6,
			}),
		).toBe("leroy merlin|2026-03|2|6");
	});
});

describe("resolveInstallmentPurchaseDate", () => {
	it("volta a data do ciclo para o mês da compra (padrão Nubank)", () => {
		// Fatura de junho trazendo "Parcela 5/12" com data 05/06: o Nubank carimba
		// o dia de abertura do ciclo, não a compra. Sem voltar os 4 meses, a série
		// inteira — inclusive as parcelas de fevereiro a maio — ficava datada em
		// junho, ou seja, no futuro em relação à própria fatura.
		expect(
			resolveInstallmentPurchaseDate({
				chargeDate: "2026-06-05",
				invoicePeriod: "2026-06",
				currentInstallment: 5,
			}),
		).toBe("2026-02-05");
	});

	it("mantém a data quando o cartão repete a compra original em toda parcela", () => {
		// Fatura de junho, parcela 5/12, data 13/02: já é a data da compra e o mês
		// bate com a primeira parcela. Voltar meses aqui inventaria uma data errada.
		expect(
			resolveInstallmentPurchaseDate({
				chargeDate: "2026-02-13",
				invoicePeriod: "2026-06",
				currentInstallment: 5,
			}),
		).toBe("2026-02-13");
	});

	it("não mexe na primeira parcela", () => {
		expect(
			resolveInstallmentPurchaseDate({
				chargeDate: "2026-03-04",
				invoicePeriod: "2026-03",
				currentInstallment: 1,
			}),
		).toBe("2026-03-04");
	});

	it("nunca devolve data posterior à fatura da parcela", () => {
		const resolvida = resolveInstallmentPurchaseDate({
			chargeDate: "2026-06-05",
			invoicePeriod: "2026-06",
			currentInstallment: 5,
		});

		// A primeira parcela cai em 2026-02; a compra não pode ser depois dela.
		expect(resolvida.slice(0, 7) <= "2026-02").toBe(true);
	});

	it("atravessa a virada de ano", () => {
		expect(
			resolveInstallmentPurchaseDate({
				chargeDate: "2026-02-05",
				invoicePeriod: "2026-02",
				currentInstallment: 4,
			}),
		).toBe("2025-11-05");
	});

	it("devolve a data crua quando o formato não é uma data ISO", () => {
		expect(
			resolveInstallmentPurchaseDate({
				chargeDate: "05/06/2026",
				invoicePeriod: "2026-06",
				currentInstallment: 5,
			}),
		).toBe("05/06/2026");
	});
});

describe("buildInstallmentSeriesKey", () => {
	it("reconhece a mesma série pelo nome com e sem o sufixo do arquivo", () => {
		// O cadastro guarda "Mlp*Magalu-Click Pisci"; o arquivo traz o nome com
		// " - Parcela 2/2". Sem normalizar, a parcela que faltava entrava numa
		// série nova e as duas metades da compra ficavam soltas na tela.
		const doCadastro = buildInstallmentSeriesKey({
			name: "Mlp*Magalu-Click Pisci",
			installmentCount: 2,
			firstPeriod: "2026-02",
		});
		const doArquivo = buildInstallmentSeriesKey({
			name: "Mlp*Magalu-Click Pisci - Parcela 2/2",
			installmentCount: 2,
			firstPeriod: "2026-02",
		});

		expect(doArquivo).toBe(doCadastro);
	});

	it("separa duas compras iguais que começam em meses diferentes", () => {
		const janeiro = buildInstallmentSeriesKey({
			name: "Centauro",
			installmentCount: 5,
			firstPeriod: "2026-01",
		});
		const marco = buildInstallmentSeriesKey({
			name: "Centauro",
			installmentCount: 5,
			firstPeriod: "2026-03",
		});

		expect(janeiro).not.toBe(marco);
	});

	it("separa compras com número de parcelas diferente", () => {
		expect(
			buildInstallmentSeriesKey({
				name: "Centauro",
				installmentCount: 5,
				firstPeriod: "2026-01",
			}),
		).not.toBe(
			buildInstallmentSeriesKey({
				name: "Centauro",
				installmentCount: 10,
				firstPeriod: "2026-01",
			}),
		);
	});

	it("é a mesma chave partindo de qualquer parcela da série", () => {
		// A chave é montada a partir do período da primeira parcela, então a 1/12
		// de março e a 5/12 de julho precisam chegar ao mesmo lugar.
		const pelaPrimeira = buildInstallmentSeriesKey({
			name: "Claro Lj Igt Campin",
			installmentCount: 12,
			firstPeriod: getInstallmentBasePeriod("2026-03", 1),
		});
		const pelaQuinta = buildInstallmentSeriesKey({
			name: "Claro Lj Igt Campin",
			installmentCount: 12,
			firstPeriod: getInstallmentBasePeriod("2026-07", 5),
		});

		expect(pelaQuinta).toBe(pelaPrimeira);
	});
});
