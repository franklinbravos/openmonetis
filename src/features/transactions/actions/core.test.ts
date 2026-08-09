import { describe, expect, it } from "vitest";
import { centsToDecimalString, isInitialBalanceTransaction } from "./core";

describe("centsToDecimalString", () => {
	it("converte centavos em decimal com 2 casas", () => {
		expect(centsToDecimalString(5050)).toBe("50.50");
		expect(centsToDecimalString(5000)).toBe("50.00");
		expect(centsToDecimalString(5)).toBe("0.05");
	});

	it("lida com valores negativos", () => {
		expect(centsToDecimalString(-5050)).toBe("-50.50");
	});

	it("normaliza -0 para 0.00", () => {
		expect(centsToDecimalString(-0)).toBe("0.00");
	});
});

describe("isInitialBalanceTransaction", () => {
	const base = {
		note: "saldo inicial",
		transactionType: "Receita",
		condition: "À vista",
		paymentMethod: "Pix",
	};

	it("reconhece lançamento de saldo inicial", () => {
		expect(isInitialBalanceTransaction(base)).toBe(true);
	});

	it("rejeita quando um campo difere", () => {
		expect(isInitialBalanceTransaction({ ...base, note: "Outra coisa" })).toBe(
			false,
		);
		expect(
			isInitialBalanceTransaction({ ...base, paymentMethod: "Crédito" }),
		).toBe(false);
		expect(
			isInitialBalanceTransaction({ ...base, transactionType: "Despesa" }),
		).toBe(false);
	});

	it("rejeita registro nulo ou vazio", () => {
		expect(isInitialBalanceTransaction(null)).toBe(false);
		expect(isInitialBalanceTransaction(undefined)).toBe(false);
	});
});
