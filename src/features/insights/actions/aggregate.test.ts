import { describe, expect, it } from "vitest";
import { sumByType } from "./aggregate";

describe("sumByType", () => {
	it("soma receitas e despesas aceitando totalAmount como string e number", () => {
		const rows = [
			{ transactionType: "Receita", totalAmount: "120.50" },
			{ transactionType: "Receita", totalAmount: 300 },
			{ transactionType: "Despesa", totalAmount: "-100.25" },
		];

		expect(sumByType(rows)).toEqual({ income: 420.5, expense: 100.25 });
	});

	it("ignora valores nulos e tipos desconhecidos", () => {
		const rows = [
			{ transactionType: "Receita", totalAmount: null },
			{ transactionType: "Despesa", totalAmount: undefined },
			{ transactionType: "Transferência", totalAmount: "-50" },
			{ transactionType: "Outro", totalAmount: "30" },
		];

		expect(sumByType(rows)).toEqual({ income: 0, expense: 0 });
	});

	it("lida com array vazio e mix de tipos", () => {
		expect(sumByType([])).toEqual({ income: 0, expense: 0 });

		const rows = [
			{ transactionType: null, totalAmount: "-10" },
			{ transactionType: "Receita", totalAmount: "99.99" },
			{ transactionType: "Despesa", totalAmount: 5 },
		];

		expect(sumByType(rows)).toEqual({ income: 99.99, expense: 5 });
	});
});
