import { describe, expect, it } from "vitest";
import {
	isPeriodLockedTransaction,
	type MovableTransactionSnapshot,
} from "./import-move-period";

function buildSnapshot(
	overrides: Partial<MovableTransactionSnapshot> = {},
): MovableTransactionSnapshot {
	return {
		condition: "À vista",
		installmentCount: null,
		recurrenceCount: null,
		...overrides,
	};
}

describe("import-move-period", () => {
	it("trava parcela completa da série", () => {
		expect(
			isPeriodLockedTransaction(
				buildSnapshot({ condition: "Parcelado", installmentCount: 10 }),
			),
		).toBe(true);
	});

	it("trava ocorrência recorrente fechada", () => {
		expect(
			isPeriodLockedTransaction(
				buildSnapshot({ condition: "Recorrente", recurrenceCount: 6 }),
			),
		).toBe(true);
	});

	it("trava ocorrência de recorrência aberta, sem quantidade definida", () => {
		expect(
			isPeriodLockedTransaction(buildSnapshot({ condition: "Recorrente" })),
		).toBe(true);
	});

	it("libera lançamento à vista sem sinal de série", () => {
		expect(isPeriodLockedTransaction(buildSnapshot())).toBe(false);
	});

	it("trava parcela com condição parcelada e números ausentes", () => {
		expect(
			isPeriodLockedTransaction(buildSnapshot({ condition: "Parcelado" })),
		).toBe(true);
	});

	it("trava linha com apenas a quantidade de parcelas preenchida", () => {
		expect(
			isPeriodLockedTransaction(buildSnapshot({ installmentCount: 9 })),
		).toBe(true);
	});

	it("trava linha com apenas a quantidade de recorrências preenchida", () => {
		expect(
			isPeriodLockedTransaction(buildSnapshot({ recurrenceCount: 12 })),
		).toBe(true);
	});

	it("trava condição de série gravada em outro caixa", () => {
		expect(
			isPeriodLockedTransaction(buildSnapshot({ condition: " PARCELADO " })),
		).toBe(true);
		expect(
			isPeriodLockedTransaction(buildSnapshot({ condition: " recorrente " })),
		).toBe(true);
	});

	it("libera lançamento com condição vazia e sem sinal de série", () => {
		expect(isPeriodLockedTransaction(buildSnapshot({ condition: "" }))).toBe(
			false,
		);
	});
});
