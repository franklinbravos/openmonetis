import { describe, expect, it } from "vitest";
import { ActionError } from "@/shared/lib/actions/action-error";
import { parsePdfText } from "./pdf-parser";

const EXTRATO =
	"1/3  EXTRATO DE CONTA  Franklin Diogo Aparecido Bravos Querino Dos Santos  CPF/CNPJ:   32253229890   1   70313800492 Agência:   Conta:  De 01-08-2026 al 31-08-2026 Periodo: Saldo inicial:   R$ 10,63   Entradas:   R$ 942,20  Saidas:   R$ -947,32  DETALHE DOS MOVIMENTOS  Data   Descrição   ID da operação   Valor   Saldo  03-08-2026   Rendimentos   1747687190102   R$ 0,01   R$ 10,64 27-08-2026   Rendimentos   1749007742604   R$ 0,01   R$ 5,51";

describe("parsePdfText — Mercado Pago", () => {
	it("roteia extrato de conta do Mercado Pago", () => {
		const statement = parsePdfText(EXTRATO);

		expect(statement.source).toBe("Mercado Pago");
		expect(statement.isCreditCard).toBe(false);
		expect(statement.transactions).toHaveLength(2);
	});

	it("PDF não reconhecido lança ActionError citando Mercado Pago", () => {
		const texto =
			"Este documento tem texto suficiente mas não é um extrato ou fatura suportada pelo OpenMonetis.";
		expect(() => parsePdfText(texto)).toThrow(ActionError);
		expect(() => parsePdfText(texto)).toThrow(/Mercado Pago/);
	});

	it("PDF sem texto lança mensagem de digitalizado", () => {
		expect(() => parsePdfText("   \n\t  ")).toThrow(ActionError);
		expect(() => parsePdfText("   \n\t  ")).toThrow(/digitalizado/i);
	});
});
