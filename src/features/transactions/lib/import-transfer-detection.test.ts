import { describe, expect, it } from "vitest";
import type { SelectOption } from "@/features/transactions/components/types";
import {
	findBravosInterPjAccount,
	guessImportTransfer,
	isBravosInterPixTransferDescription,
} from "./import-transfer-detection";

const BRAVOS_PIX_DESCRIPTION =
	"Transferência recebida pelo Pix - BRAVOS COMPANY - 46.268.915/0001-83 - BANCO INTER (0077) Agência: 1 Conta:";

const accountOptions: SelectOption[] = [
	{ value: "pf-inter", label: "Inter PF", logo: "inter" },
	{ value: "pj-inter", label: "Bravos Company PJ", logo: "inter" },
	{ value: "nubank", label: "Nubank", logo: "nubank" },
];

describe("isBravosInterPixTransferDescription", () => {
	it("identifica transferência Pix da Bravos Company no Inter", () => {
		expect(isBravosInterPixTransferDescription(BRAVOS_PIX_DESCRIPTION)).toBe(
			true,
		);
	});

	it("ignora descrições genéricas", () => {
		expect(
			isBravosInterPixTransferDescription("Pix recebido de João Silva"),
		).toBe(false);
	});
});

describe("findBravosInterPjAccount", () => {
	it("prioriza conta com nome Bravos/Company", () => {
		expect(findBravosInterPjAccount(accountOptions, "pf-inter")?.value).toBe(
			"pj-inter",
		);
	});

	it("exclui a conta do extrato importado", () => {
		expect(findBravosInterPjAccount(accountOptions, "pj-inter")?.value).toBe(
			"pf-inter",
		);
	});
});

describe("guessImportTransfer", () => {
	it("configura transferência com conta origem PJ", () => {
		expect(
			guessImportTransfer(
				BRAVOS_PIX_DESCRIPTION,
				"income",
				accountOptions,
				"pf-inter",
			),
		).toEqual({
			kind: "transfer",
			transferPeerAccountId: "pj-inter",
		});
	});

	it("não aplica em despesas", () => {
		expect(
			guessImportTransfer(
				BRAVOS_PIX_DESCRIPTION,
				"expense",
				accountOptions,
				"pf-inter",
			),
		).toBeNull();
	});

	it("retorna null quando não encontra conta par", () => {
		expect(
			guessImportTransfer(BRAVOS_PIX_DESCRIPTION, "income", [], "pf-inter"),
		).toBeNull();
	});
});
