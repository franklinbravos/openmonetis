import { describe, expect, it } from "vitest";
import {
	findRegisteredRowsMissingFromFile,
	sourceFileRowsFromTransactions,
} from "./invoice-file-match";

describe("findRegisteredRowsMissingFromFile", () => {
	it("não marca como extra o lançamento que já está no arquivo pelo FITID", () => {
		const extras = findRegisteredRowsMissingFromFile(
			[
				{
					id: "registered-1",
					ofxFitId: "fit-cia-food",
					name: "Cia Food",
					amount: "-7.00",
					transactionType: "Despesa",
				},
			],
			sourceFileRowsFromTransactions([
				{
					externalId: "fit-cia-food",
					date: "2025-12-05",
					amount: 7,
					description: "Cia Food",
					transactionType: "expense",
				},
			]),
		);

		expect(extras).toHaveLength(0);
	});

	it("não marca como extra o lançamento conferido por nome e valor, mesmo sem FITID", () => {
		const extras = findRegisteredRowsMissingFromFile(
			[
				{
					id: "registered-1",
					ofxFitId: null,
					name: "Amazon Kindle Unltd",
					amount: "-24.90",
					transactionType: "Despesa",
				},
			],
			sourceFileRowsFromTransactions([
				{
					externalId: "fit-amazon",
					date: "2025-12-01",
					amount: 24.9,
					description: "Amazon Kindle Unltd",
					transactionType: "expense",
				},
			]),
		);

		expect(extras).toHaveLength(0);
	});

	it("lista só o que está no OpenMonetis e não aparece no arquivo", () => {
		const extras = findRegisteredRowsMissingFromFile(
			[
				{
					id: "in-file",
					ofxFitId: "fit-1",
					name: "Cia Food",
					amount: "-7.00",
					transactionType: "Despesa",
				},
				{
					id: "extra-manual",
					ofxFitId: null,
					name: "Compra avulsa",
					amount: "-262.27",
					transactionType: "Despesa",
				},
			],
			sourceFileRowsFromTransactions([
				{
					externalId: "fit-1",
					date: "2025-12-05",
					amount: 7,
					description: "Cia Food",
					transactionType: "expense",
				},
			]),
		);

		expect(extras.map((row) => row.id)).toEqual(["extra-manual"]);
	});

	it("não marca como extra a parcela cadastrada sem o sufixo do arquivo", () => {
		// O cadastro guarda "Fabio C Thomaziello"; o arquivo traz a mesma compra
		// como "Fabio C Thomaziello - Parcela 6/10". Comparar as strings cruas
		// nunca bate para nenhuma parcela cadastrada.
		const extras = findRegisteredRowsMissingFromFile(
			[
				{
					id: "fabio-parcela-6",
					ofxFitId: null,
					name: "Fabio C Thomaziello",
					amount: "-260.00",
					transactionType: "Despesa",
				},
			],
			sourceFileRowsFromTransactions([
				{
					externalId: "fit-fabio",
					date: "2026-03-04",
					amount: 260,
					description: "Fabio C Thomaziello - Parcela 6/10",
					transactionType: "expense",
				},
			]),
		);

		expect(extras).toHaveLength(0);
	});
});
