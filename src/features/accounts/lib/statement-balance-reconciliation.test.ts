import { describe, expect, it } from "vitest";
import {
	computeProjectedStatementClosingBalance,
	computeStatementMonthNetInCadastro,
	isAccountStatementMovementImportRow,
	partitionStatementMonthDbRows,
} from "./statement-balance-reconciliation";

describe("partitionStatementMonthDbRows", () => {
	const statementPeriod = "2026-07";
	const statementStart = "2026-07-01";
	const statementEnd = "2026-07-31";

	it("conta lançamentos datados no mês mesmo com período posterior", () => {
		const { inMonthByDateRows, misfiledForwardPeriodRows, outOfMonthRows } =
			partitionStatementMonthDbRows(
				[
					{
						id: "aug-row",
						amount: 241.31,
						purchaseDate: new Date(2026, 6, 15),
						name: "Transferência",
						period: "2026-08",
					},
					{
						id: "jul-row",
						amount: -100,
						purchaseDate: new Date(2026, 6, 20),
						name: "Mercado",
						period: "2026-07",
					},
				],
				statementPeriod,
				statementStart,
				statementEnd,
			);

		expect(inMonthByDateRows).toHaveLength(2);
		expect(misfiledForwardPeriodRows).toHaveLength(1);
		expect(misfiledForwardPeriodRows[0]?.id).toBe("aug-row");
		expect(outOfMonthRows).toHaveLength(0);
	});

	it("separa lançamentos do período com data em outro mês", () => {
		const { inMonthByDateRows, outOfMonthRows } = partitionStatementMonthDbRows(
			[
				{
					amount: 50,
					purchaseDate: new Date(2026, 7, 2),
					name: "Agosto no extrato de julho",
					period: "2026-07",
				},
			],
			statementPeriod,
			statementStart,
			statementEnd,
		);

		expect(inMonthByDateRows).toHaveLength(0);
		expect(outOfMonthRows).toHaveLength(1);
	});

	it("ignora ajuste de saldo na partição de movimento", () => {
		const { inMonthByDateRows, misfiledForwardPeriodRows } =
			partitionStatementMonthDbRows(
				[
					{
						amount: 39929,
						purchaseDate: new Date(2026, 6, 31),
						name: "Ajuste de saldo",
						period: "2026-08",
					},
				],
				statementPeriod,
				statementStart,
				statementEnd,
			);

		expect(inMonthByDateRows).toHaveLength(0);
		expect(misfiledForwardPeriodRows).toHaveLength(0);
	});
});

describe("computeStatementMonthNetInCadastro", () => {
	const statementPeriod = "2026-07";

	it("conta linhas vinculadas pelo valor do extrato quando o cadastro está em outro mês", () => {
		const net = computeStatementMonthNetInCadastro({
			statementPeriod,
			inMonthByDateRows: [
				{
					id: "db-july",
					amount: 295.38,
					purchaseDate: new Date(2026, 6, 10),
					name: "Pix",
					period: "2026-07",
				},
			],
			importRows: [],
			fileRows: [
				{
					date: "2026-07-15",
					description: "Transferência",
					amount: 241.31,
					transactionType: "income",
					existingTransactionId: "aug-import",
				},
			],
			yieldAmount: 0,
		});

		expect(net).toBe(536.69);
	});

	it("não duplica lançamento vinculado que já entra na busca por data", () => {
		const net = computeStatementMonthNetInCadastro({
			statementPeriod,
			inMonthByDateRows: [
				{
					id: "linked",
					amount: 100,
					purchaseDate: new Date(2026, 6, 5),
					name: "Pix",
					period: "2026-08",
				},
			],
			importRows: [],
			fileRows: [
				{
					date: "2026-07-05",
					description: "Pix",
					amount: 100,
					transactionType: "income",
					existingTransactionId: "linked",
				},
			],
			yieldAmount: 0,
		});

		expect(net).toBe(100);
	});

	it("soma linhas novas selecionadas para importação", () => {
		const net = computeStatementMonthNetInCadastro({
			statementPeriod,
			inMonthByDateRows: [],
			importRows: [
				{
					date: "2026-07-20",
					description: "Mercado",
					amount: 50,
					transactionType: "expense",
				},
			],
			fileRows: [
				{
					date: "2026-07-20",
					description: "Mercado",
					amount: 50,
					transactionType: "expense",
				},
			],
			yieldAmount: 0,
		});

		expect(net).toBe(-50);
	});
});

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
