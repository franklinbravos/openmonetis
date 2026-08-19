import { describe, expect, it } from "vitest";
import type { InvoiceFileRowFingerprint } from "@/shared/lib/import/invoice-file-match";
import { pairInvoiceAgainstFile } from "@/shared/lib/import/invoice-pairing";
import type { InvoiceReconciliationExistingRow } from "@/shared/lib/import/invoice-total";

function registered(
	overrides: Partial<InvoiceReconciliationExistingRow> &
		Pick<InvoiceReconciliationExistingRow, "id">,
): InvoiceReconciliationExistingRow {
	return {
		ofxFitId: null,
		name: "Compra",
		amount: "-100.00",
		transactionType: "Despesa",
		purchaseDate: "2026-01-05",
		...overrides,
	};
}

function fileRow(
	overrides: Partial<InvoiceFileRowFingerprint> = {},
): InvoiceFileRowFingerprint {
	return {
		externalId: null,
		date: "2026-01-05",
		amount: 100,
		transactionType: "expense",
		description: "COMPRA",
		...overrides,
	};
}

describe("pairInvoiceAgainstFile", () => {
	it("casa cadastro humanizado com a linha do cartão por valor e data", () => {
		const result = pairInvoiceAgainstFile(
			[registered({ id: "manual", name: "Farmácia da esquina" })],
			[fileRow({ description: "DROGASIL2832 SAO PAULO" })],
		);

		expect(result.extras).toEqual([]);
		expect(result.missing).toEqual([]);
		expect(result.pairs).toHaveLength(1);
		expect(result.pairs[0].signedDelta).toBe(0);
		expect(result.pairs[0].rule).toBe("amount_and_date");
	});

	it("casa por valor quando a data do cadastro diverge da fatura", () => {
		const result = pairInvoiceAgainstFile(
			[
				registered({
					id: "a",
					name: "Mercado Livre",
					purchaseDate: "2026-01-02",
				}),
			],
			[fileRow({ description: "Mercadolivre*Fios", date: "2026-01-05" })],
		);

		expect(result.pairs).toHaveLength(1);
		expect(result.pairs[0].signedDelta).toBe(0);
		expect(result.extras).toEqual([]);
		expect(result.missing).toEqual([]);
	});

	it("propõe ajuste de valor em vez de apagar e recriar", () => {
		const result = pairInvoiceAgainstFile(
			[
				registered({
					id: "a",
					name: "Oba Hortifruti",
					amount: "-52.21",
					purchaseDate: "2026-01-03",
				}),
			],
			[
				fileRow({
					description: "OBA HORTIFRUTI",
					amount: 58.9,
					date: "2026-01-04",
				}),
			],
		);

		expect(result.pairs).toHaveLength(1);
		expect(result.pairs[0].rule).toBe("name_with_amount_delta");
		expect(result.pairs[0].signedDelta).toBe(6.69);
		expect(result.extras).toEqual([]);
		expect(result.missing).toEqual([]);
	});

	it("ajusta o valor quando sobra um de cada lado no mesmo dia", () => {
		const result = pairInvoiceAgainstFile(
			[registered({ id: "a", name: "Presente da mãe", amount: "-140.00" })],
			[fileRow({ description: "VIVARA XCA", amount: 145.9 })],
		);

		expect(result.pairs).toHaveLength(1);
		expect(result.pairs[0].confidence).toBe("weak");
		expect(result.pairs[0].signedDelta).toBe(5.9);
	});

	it("não inventa par quando sobram vários candidatos no mesmo dia", () => {
		const result = pairInvoiceAgainstFile(
			[
				registered({ id: "a", name: "Almoço", amount: "-30.00" }),
				registered({ id: "b", name: "Estacionamento", amount: "-12.00" }),
			],
			[
				fileRow({ description: "RESTAURANTE X", amount: 33 }),
				fileRow({ description: "ESTAPAR", amount: 15 }),
			],
		);

		expect(result.pairs).toEqual([]);
		expect(result.extras.map((row) => row.id)).toEqual(["a", "b"]);
		expect(result.missing).toHaveLength(2);
	});

	it("mantém duas compras iguais no mesmo dia como dois pares", () => {
		const result = pairInvoiceAgainstFile(
			[
				registered({ id: "a", name: "Mikrolot Hamburguer", amount: "-47.00" }),
				registered({ id: "b", name: "Mikrolot Hamburguer", amount: "-47.00" }),
			],
			[
				fileRow({ description: "Mikrolot Hamburguer", amount: 47 }),
				fileRow({ description: "Mikrolot Hamburguer", amount: 47 }),
			],
		);

		expect(result.pairs).toHaveLength(2);
		expect(result.extras).toEqual([]);
		expect(result.missing).toEqual([]);
	});

	it("separa excesso do cadastro e linha faltando", () => {
		const result = pairInvoiceAgainstFile(
			[
				registered({ id: "ok", name: "Padaria", amount: "-20.00" }),
				registered({
					id: "sobra",
					name: "Compra que não existe na fatura",
					amount: "-999.00",
					purchaseDate: "2026-01-09",
				}),
			],
			[
				fileRow({ description: "PADARIA REAL", amount: 20 }),
				fileRow({
					description: "COMPRA NOVA",
					amount: 77,
					date: "2026-01-08",
				}),
			],
		);

		expect(result.pairs.map((pair) => pair.registered.id)).toEqual(["ok"]);
		expect(result.extras.map((row) => row.id)).toEqual(["sobra"]);
		expect(result.missing.map((row) => row.description)).toEqual([
			"COMPRA NOVA",
		]);
	});

	it("casa parcela pelo nome base, ignorando o N/M", () => {
		const result = pairInvoiceAgainstFile(
			[
				registered({
					id: "a",
					name: "Mobly Comercio Varejis",
					amount: "-586.27",
					purchaseDate: "2025-12-05",
				}),
			],
			[
				fileRow({
					description: "Mobly Comercio Varejis - Parcela 9/10",
					amount: 586.27,
					date: "2026-01-05",
				}),
			],
		);

		expect(result.pairs[0]?.rule).toBe("amount_and_name");
	});

	it("ignora pagamento de fatura do lado cadastrado", () => {
		const result = pairInvoiceAgainstFile(
			[registered({ id: "pgto", name: "Pagamento fatura", amount: "500.00" })],
			[],
		);

		expect(result.extras).toEqual([]);
		expect(result.pairs).toEqual([]);
	});
});
