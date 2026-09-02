import { describe, expect, it } from "vitest";
import {
	computeProjectedStatementClosingBalance,
	isAccountStatementMovementImportRow,
} from "./statement-balance-reconciliation";

describe("computeProjectedStatementClosingBalance", () => {
	it("projeta o fechamento a partir do saldo inicial do extrato, não do cadastro", () => {
		// Cadastro com abertura de agosto errada (−41k), mas o líquido do mês bate
		// com o extrato (−1.206,12). O ajuste de julho corrige a abertura para
		// R$ 1.272,08 — o fechamento projetado deve ser R$ 65,96, não −R$ 38.740.
		const projected = computeProjectedStatementClosingBalance({
			openingBalanceAfterAdjustment: 1272.08,
			statementOpeningBalanceInDb: 5000,
			statementCurrentBalanceInDb: 3793.88,
			relocatedFromStatementMonth: 0,
			importNetInStatement: 0,
			yieldAmount: 0,
		});

		expect(projected).toBe(65.96);
	});

	it("desconta ajuste de saldo que sai do mês do extrato", () => {
		const projected = computeProjectedStatementClosingBalance({
			openingBalanceAfterAdjustment: 1000,
			statementOpeningBalanceInDb: 1000,
			statementCurrentBalanceInDb: 800,
			relocatedFromStatementMonth: 50,
			importNetInStatement: 0,
			yieldAmount: 0,
		});

		expect(projected).toBe(750);
	});

	it("fecha com o extrato quando o cadastro só tem ajuste de saldo a mais no mês", () => {
		// Cadastro: líquido operacional −1.206,12 + ajuste mal posicionado +3.769,23 = +2.563,11
		const projected = computeProjectedStatementClosingBalance({
			openingBalanceAfterAdjustment: 1272.08,
			statementOpeningBalanceInDb: 5000,
			statementCurrentBalanceInDb: 7563.11,
			relocatedFromStatementMonth: 3769.23,
			importNetInStatement: 0,
			yieldAmount: 0,
		});

		expect(projected).toBe(65.96);
	});
});

describe("isAccountStatementMovementImportRow", () => {
	it("pagamento de fatura move o saldo da conta e entra no líquido", () => {
		// O extrato Inter de agosto/2026 debita R$ 78,00 de "Debito Automatico
		// Fatura Cartao Inter". Deixando essa linha de fora, o líquido do arquivo
		// dava −R$ 938,99 contra os −R$ 1.016,99 que os próprios saldos declaram:
		// 1.017,81 − 1.016,99 = 0,82, o saldo final do extrato.
		expect(isAccountStatementMovementImportRow("invoice_payment")).toBe(true);
		expect(isAccountStatementMovementImportRow("transaction")).toBe(true);
		expect(isAccountStatementMovementImportRow("transfer")).toBe(true);
	});

	it("linha de excesso da fatura não é movimento de conta", () => {
		expect(isAccountStatementMovementImportRow("invoice_extra")).toBe(false);
	});
});
