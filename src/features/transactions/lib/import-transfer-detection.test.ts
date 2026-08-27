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

describe("transferência entre contas próprias", () => {
	const TITULAR = {
		name: "Franklin Diogo Aparecido Bravos Querino dos Santos",
		document: "•••.532.298-••",
	};

	const CONTAS = [
		{ value: "conta-nubank", label: "Nubank" },
		{ value: "conta-mp", label: "Mercado Pago" },
		{ value: "conta-inter", label: "Inter PJ" },
	];

	// Caso real do extrato de janeiro: R$ 6.000 do Mercado Pago para o Nubank,
	// no mesmo dia em que a fatura do cartão foi paga.
	const PROPRIA =
		"Transferência recebida pelo Pix Franklin Diogo Aparecido Bravos Querino Dos Santos - •••.532.298-•• - MERCADO PAGO IP LTDA. (0323) Agência: 1 Conta: 7031380049-2";

	const TERCEIRO =
		"Transferência recebida pelo Pix ZENILDA Q M SANTOS - •••.980.988-•• - BCO DO BRASIL S.A. (0001) Agência: 1515 Conta: 113942-8";

	it("reconhece o Pix de mim para mim e acha a conta de origem", () => {
		expect(
			guessImportTransfer(PROPRIA, "income", CONTAS, "conta-nubank", TITULAR),
		).toEqual({ kind: "transfer", transferPeerAccountId: "conta-mp" });
	});

	it("vale também na saída, não só na entrada", () => {
		// A regra antiga só disparava para entrada; dinheiro saindo para a conta
		// própria é a mesma transferência vista do outro lado.
		const saida = PROPRIA.replace("recebida", "enviada");

		expect(
			guessImportTransfer(saida, "expense", CONTAS, "conta-nubank", TITULAR),
		).toEqual({ kind: "transfer", transferPeerAccountId: "conta-mp" });
	});

	it("Pix para terceiro continua sendo receita", () => {
		expect(
			guessImportTransfer(TERCEIRO, "income", CONTAS, "conta-nubank", TITULAR),
		).toBeNull();
	});

	it("exige documento E nome: só um dos dois não basta", () => {
		const outroDocumento = PROPRIA.replace("•••.532.298-••", "•••.111.222-••");
		expect(
			guessImportTransfer(
				outroDocumento,
				"income",
				CONTAS,
				"conta-nubank",
				TITULAR,
			),
		).toBeNull();

		const outroNome = PROPRIA.replace(
			"Franklin Diogo Aparecido Bravos Querino Dos Santos",
			"Maria Luiza Garcia Guarise",
		);
		expect(
			guessImportTransfer(outroNome, "income", CONTAS, "conta-nubank", TITULAR),
		).toBeNull();
	});

	it("é transferência mesmo sem saber a contraparte", () => {
		// Melhor pedir a conta ao usuário do que deixar entrar como receita e
		// inflar o resultado do mês dos dois lados.
		const semConta = [
			{ value: "conta-nubank", label: "Nubank" },
			{ value: "conta-inter", label: "Inter PJ" },
		];

		expect(
			guessImportTransfer(PROPRIA, "income", semConta, "conta-nubank", TITULAR),
		).toEqual({ kind: "transfer", transferPeerAccountId: null });
	});

	it("não escolhe entre duas contas que casam", () => {
		const ambiguo = [
			{ value: "conta-nubank", label: "Nubank" },
			{ value: "conta-mp1", label: "Mercado Pago" },
			{ value: "conta-mp2", label: "Mercado" },
		];

		expect(
			guessImportTransfer(PROPRIA, "income", ambiguo, "conta-nubank", TITULAR)
				?.transferPeerAccountId,
		).toBeNull();
	});

	it("sem titular declarado, cai na regra antiga", () => {
		// Extrato em OFX não traz titular; o comportamento anterior é preservado.
		const bravos =
			"Transferência recebida pelo Pix BRAVOS COMPANY - 46.268.915/0001-83 - BANCO INTER";

		expect(
			guessImportTransfer(PROPRIA, "income", CONTAS, "conta-nubank", null),
		).toBeNull();
		expect(
			guessImportTransfer(bravos, "income", CONTAS, "conta-nubank", null)
				?.transferPeerAccountId,
		).toBe("conta-inter");
	});
});
