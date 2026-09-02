import { and, eq } from "drizzle-orm";
import { categories, transactions } from "@/db/schema";
import { upsertAccountBalanceAdjustmentInTx } from "@/features/accounts/lib/balance-adjustment";
import { fetchAccountSummary } from "@/features/accounts/statement-queries";
import {
	ACCOUNT_BALANCE_ADJUSTMENT_NAME,
	INITIAL_BALANCE_CONDITION,
} from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import type { AccountStatementBalances } from "@/shared/lib/import/account-statement-balances";
import {
	computeStatementMonthNetFromFileRows,
	computeStatementYieldGap,
	deriveStatementPeriodFromBalances,
	isAccountBalanceAdjustmentLabel,
	resolveBalanceAdjustmentPlacement,
	shouldRelocateBalanceAdjustmentRow,
} from "@/shared/lib/import/account-statement-balances";
import {
	roundMoney,
	SOURCE_ROUNDING_TOLERANCE,
} from "@/shared/lib/import/invoice-total";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString, toDateOnlyString } from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import {
	derivePeriodFromDate,
	getPeriodPurchaseDateBounds,
} from "@/shared/utils/period";

const ACCOUNT_YIELD_CATEGORY_NAME = "Rendimentos";
const ACCOUNT_YIELD_TRANSACTION_NAME = "Rendimento";
const ACCOUNT_YIELD_PAYMENT_METHOD = "Transferência bancária" as const;

type ImportRowSnapshot = {
	date: string;
	description: string;
	amount: number;
	transactionType: "income" | "expense";
};

export type AccountStatementBalancePreview = {
	statementPeriod: string;
	previousPeriod: string;
	adjustmentDate: string;
	/** Intervalo que o arquivo cobre, como o extrato declara. */
	statementFrom: string;
	statementTo: string;
	openingBalance: number;
	closingBalance: number;
	/** Entradas e saídas declaradas no extrato, em módulo. */
	totalIn: number | null;
	totalOut: number | null;
	/**
	 * Saldo da conta no cadastro no fim do mês anterior, antes de qualquer
	 * ajuste — é dele que sai o valor do ajuste, e sem mostrá-lo o número do
	 * ajuste aparece do nada.
	 */
	previousBalanceInCadastro: number;
	/**
	 * Lançamentos arquivados no período do extrato mas datados em outro mês.
	 *
	 * É a causa mais comum de o líquido do cadastro não bater com o do arquivo:
	 * a importação antiga carimbava o período do arquivo em toda linha.
	 */
	outOfMonthRowCount: number;
	outOfMonthRowAmount: number;
	/**
	 * O que sobra da diferença depois dos lançamentos datados em outro mês:
	 * lançamentos com data do mês que o extrato não traz.
	 *
	 * Com os dois, a diferença fecha — `extrato + fora do mês + fora do
	 * extrato = cadastro` —, e cada parcela aponta para um conserto diferente.
	 */
	unmatchedInMonthAmount: number;
	/** Valor do lançamento de ajuste (positivo = receita, negativo = despesa). */
	adjustmentAmount: number;
	yieldAmount: number;
	yieldDate: string | null;
	relocatedAdjustmentCount: number;
	/** Líquido do mês segundo as linhas do arquivo. */
	statementMonthNetFromFile: number;
	/** Líquido do mês no cadastro após relocar ajustes e importar selecionados. */
	statementMonthNetInCadastro: number;
	projectedClosingBalance: number;
	closingMatches: boolean;
};

function signedRowAmount(row: ImportRowSnapshot): number {
	return row.transactionType === "expense" ? -row.amount : row.amount;
}

/** Linhas que entram no líquido da conta (exclui pagamento de fatura). */
export function isAccountStatementMovementImportRow(kind: string): boolean {
	return kind === "transaction" || kind === "transfer";
}

/**
 * Saldo final projetado depois do ajuste de abertura.
 *
 * Não usar `statementSummary.currentBalance` direto: ele embute a abertura
 * errada do cadastro. O líquido do mês (corrente − abertura) é invariante;
 * somamos ao saldo inicial do extrato, que o ajuste de julho vai impor.
 */
export function computeProjectedStatementClosingBalance(input: {
	openingBalanceAfterAdjustment: number;
	statementOpeningBalanceInDb: number;
	statementCurrentBalanceInDb: number;
	relocatedFromStatementMonth: number;
	importNetInStatement: number;
	yieldAmount: number;
}): number {
	const monthNetInDb = roundMoney(
		input.statementCurrentBalanceInDb - input.statementOpeningBalanceInDb,
	);

	return roundMoney(
		input.openingBalanceAfterAdjustment +
			monthNetInDb -
			input.relocatedFromStatementMonth +
			input.importNetInStatement +
			input.yieldAmount,
	);
}

export async function previewAccountStatementBalanceReconciliation(input: {
	viewerUserId: string;
	dataOwnerUserId: string;
	accountId: string;
	balances: AccountStatementBalances;
	/** Todas as linhas de transação do arquivo (conferidas ou não). */
	fileRows: ImportRowSnapshot[];
	/** Linhas novas selecionadas para importar nesta confirmação. */
	importedRows: ImportRowSnapshot[];
}): Promise<AccountStatementBalancePreview | null> {
	if (!input.balances.balances) return null;

	const statementPeriod = deriveStatementPeriodFromBalances(input.balances);
	const { period: previousPeriod, date: previousPeriodLastDate } =
		resolveBalanceAdjustmentPlacement(statementPeriod);
	const adminPayerId = await getAdminPayerId(input.viewerUserId);
	if (!adminPayerId) return null;

	const yieldAmount = computeStatementYieldGap(input.balances, input.fileRows);
	const yieldDate =
		yieldAmount > SOURCE_ROUNDING_TOLERANCE
			? getPeriodPurchaseDateBounds(statementPeriod).start
			: null;

	const [
		misplacedAdjustments,
		existingPreviousAdjustment,
		previousSummary,
		statementSummary,
		statementPeriodRows,
	] = await Promise.all([
		db.query.transactions.findMany({
			columns: { id: true, amount: true },
			where: and(
				eq(transactions.userId, input.dataOwnerUserId),
				eq(transactions.accountId, input.accountId),
				eq(transactions.period, statementPeriod),
				eq(transactions.name, ACCOUNT_BALANCE_ADJUSTMENT_NAME),
				eq(transactions.payerId, adminPayerId),
			),
		}),
		db.query.transactions.findFirst({
			columns: { amount: true },
			where: and(
				eq(transactions.userId, input.dataOwnerUserId),
				eq(transactions.accountId, input.accountId),
				eq(transactions.period, previousPeriod),
				eq(transactions.name, ACCOUNT_BALANCE_ADJUSTMENT_NAME),
			),
		}),
		fetchAccountSummary(input.viewerUserId, input.accountId, previousPeriod),
		fetchAccountSummary(input.viewerUserId, input.accountId, statementPeriod),
		db.query.transactions.findMany({
			columns: {
				amount: true,
				purchaseDate: true,
				name: true,
			},
			where: and(
				eq(transactions.userId, input.dataOwnerUserId),
				eq(transactions.accountId, input.accountId),
				eq(transactions.period, statementPeriod),
				// Só o que está realizado entra no saldo — e é o saldo que se
				// confere. Contar o não realizado faria a explicação da diferença
				// não fechar com a própria diferença.
				eq(transactions.isSettled, true),
			),
		}),
	]);

	// O ajuste de saldo tem relocação própria; contá-lo aqui duplicaria.
	const movementRows = statementPeriodRows.filter(
		(row) => !isAccountBalanceAdjustmentLabel(row.name),
	);
	const outOfMonthRows = movementRows.filter(
		(row) =>
			derivePeriodFromDate(toDateOnlyString(row.purchaseDate)) !==
			statementPeriod,
	);
	const sumRows = (rows: typeof movementRows) =>
		roundMoney(
			rows.reduce((total, row) => total + safeToNumber(row.amount), 0),
		);
	const outOfMonthRowAmount = sumRows(outOfMonthRows);
	const inMonthRowAmount = sumRows(
		movementRows.filter(
			(row) =>
				derivePeriodFromDate(toDateOnlyString(row.purchaseDate)) ===
				statementPeriod,
		),
	);

	const relocatedFromDb = misplacedAdjustments.reduce(
		(total, row) => total + safeToNumber(row.amount),
		0,
	);
	const importNetInStatement = input.importedRows.reduce((total, row) => {
		if (
			shouldRelocateBalanceAdjustmentRow(
				row.date,
				row.description,
				statementPeriod,
			)
		) {
			return total;
		}
		if (derivePeriodFromDate(row.date) !== statementPeriod) return total;
		return total + signedRowAmount(row);
	}, 0);

	const existingPreviousAdjustmentAmount = Number(
		existingPreviousAdjustment?.amount ?? 0,
	);
	const basePreviousBalance = roundMoney(
		previousSummary.currentBalance - existingPreviousAdjustmentAmount,
	);
	/*
	 * Base do ajuste: o saldo do mês anterior sem o ajuste que já existe lá —
	 * senão o ajuste antigo entraria na conta do novo. Quando há ajuste no mês
	 * do extrato para relocar, a base é o saldo corrente, porque esse ajuste
	 * ainda não pertence ao mês anterior.
	 */
	const previousBalanceInCadastro =
		misplacedAdjustments.length > 0
			? roundMoney(previousSummary.currentBalance)
			: basePreviousBalance;
	const adjustmentAmount = roundMoney(
		input.balances.openingBalance - previousBalanceInCadastro,
	);

	const statementMonthNetFromFile = computeStatementMonthNetFromFileRows(
		input.fileRows,
		statementPeriod,
	);
	const monthNetInDb = roundMoney(
		statementSummary.currentBalance - statementSummary.openingBalance,
	);
	const statementMonthNetInCadastro = roundMoney(
		monthNetInDb - relocatedFromDb + importNetInStatement + yieldAmount,
	);
	const projectedClosingBalance = computeProjectedStatementClosingBalance({
		openingBalanceAfterAdjustment: input.balances.openingBalance,
		statementOpeningBalanceInDb: statementSummary.openingBalance,
		statementCurrentBalanceInDb: statementSummary.currentBalance,
		relocatedFromStatementMonth: relocatedFromDb,
		importNetInStatement,
		yieldAmount,
	});
	const closingDelta = roundMoney(
		projectedClosingBalance - input.balances.closingBalance,
	);

	return {
		statementPeriod,
		previousPeriod,
		adjustmentDate: previousPeriodLastDate,
		statementFrom: input.balances.periodFrom,
		statementTo: input.balances.periodTo,
		openingBalance: input.balances.openingBalance,
		closingBalance: input.balances.closingBalance,
		totalIn: input.balances.totalIn ?? null,
		totalOut: input.balances.totalOut ?? null,
		previousBalanceInCadastro,
		outOfMonthRowCount: outOfMonthRows.length,
		outOfMonthRowAmount,
		unmatchedInMonthAmount: roundMoney(
			inMonthRowAmount +
				importNetInStatement +
				yieldAmount -
				statementMonthNetFromFile,
		),
		adjustmentAmount,
		yieldAmount,
		yieldDate,
		relocatedAdjustmentCount:
			misplacedAdjustments.length +
			input.importedRows.filter((row) =>
				shouldRelocateBalanceAdjustmentRow(
					row.date,
					row.description,
					statementPeriod,
				),
			).length,
		statementMonthNetFromFile,
		statementMonthNetInCadastro,
		projectedClosingBalance,
		closingMatches: Math.abs(closingDelta) <= SOURCE_ROUNDING_TOLERANCE,
	};
}

export async function applyAccountStatementBalanceReconciliation(input: {
	viewerUserId: string;
	dataOwnerUserId: string;
	accountId: string;
	balances: AccountStatementBalances;
	importedRows: ImportRowSnapshot[];
}): Promise<{ success: true } | { success: false; error: string }> {
	if (!input.balances.balances) {
		return {
			success: false,
			error:
				"O bloco de saldos do extrato não fecha — revise o arquivo antes de reconciliar.",
		};
	}

	const adminPayerId = await getAdminPayerId(input.viewerUserId);
	if (!adminPayerId) {
		return {
			success: false,
			error:
				"Pessoa administradora não encontrada. Crie uma pessoa admin antes de ajustar o saldo.",
		};
	}

	const statementPeriod = deriveStatementPeriodFromBalances(input.balances);
	/*
	 * O ajuste do mês do extrato é empurrado para a véspera e recalculado. É o
	 * que permite importar para trás: agosto deixa o ajuste em 31/07, julho o
	 * encontra ali e o manda para 30/06, e assim por diante.
	 */
	const { period: previousPeriod, date: previousPeriodLastDate } =
		resolveBalanceAdjustmentPlacement(statementPeriod);
	const yieldGap = computeStatementYieldGap(input.balances, input.importedRows);

	try {
		await db.transaction(async (tx) => {
			const misplacedAdjustments = await tx.query.transactions.findMany({
				columns: { id: true },
				where: and(
					eq(transactions.userId, input.dataOwnerUserId),
					eq(transactions.accountId, input.accountId),
					eq(transactions.period, statementPeriod),
					eq(transactions.name, ACCOUNT_BALANCE_ADJUSTMENT_NAME),
					eq(transactions.payerId, adminPayerId),
				),
			});

			for (const adjustment of misplacedAdjustments) {
				await tx
					.update(transactions)
					.set({
						period: previousPeriod,
						purchaseDate: parseLocalDateString(previousPeriodLastDate),
					})
					.where(eq(transactions.id, adjustment.id));
			}

			if (yieldGap > SOURCE_ROUNDING_TOLERANCE) {
				const yieldCategory = await tx.query.categories.findFirst({
					columns: { id: true },
					where: and(
						eq(categories.userId, input.dataOwnerUserId),
						eq(categories.name, ACCOUNT_YIELD_CATEGORY_NAME),
					),
				});

				const statementStart =
					getPeriodPurchaseDateBounds(statementPeriod).start;

				await tx.insert(transactions).values({
					condition: INITIAL_BALANCE_CONDITION,
					name: ACCOUNT_YIELD_TRANSACTION_NAME,
					paymentMethod: ACCOUNT_YIELD_PAYMENT_METHOD,
					note: "Rendimento líquido declarado no extrato.",
					amount: formatDecimalForDbRequired(yieldGap),
					purchaseDate: parseLocalDateString(statementStart),
					transactionType: "Receita",
					period: statementPeriod,
					isSettled: true,
					userId: input.dataOwnerUserId,
					accountId: input.accountId,
					cardId: null,
					categoryId: yieldCategory?.id ?? null,
					payerId: adminPayerId,
				});
			}
		});

		const previousSummary = await fetchAccountSummary(
			input.viewerUserId,
			input.accountId,
			previousPeriod,
		);

		await db.transaction(async (tx) => {
			await upsertAccountBalanceAdjustmentInTx(tx, {
				dataOwnerUserId: input.dataOwnerUserId,
				accountId: input.accountId,
				period: previousPeriod,
				purchaseDate: previousPeriodLastDate,
				currentBalance: previousSummary.currentBalance,
				targetBalance: input.balances.openingBalance,
				adminPayerId,
			});
		});

		const statementSummary = await fetchAccountSummary(
			input.viewerUserId,
			input.accountId,
			statementPeriod,
		);

		const closingDelta = roundMoney(
			statementSummary.currentBalance - input.balances.closingBalance,
		);

		if (Math.abs(closingDelta) > SOURCE_ROUNDING_TOLERANCE) {
			return {
				success: false,
				error: `Saldo final do mês (${statementSummary.currentBalance.toFixed(2)}) não bate com o extrato (${input.balances.closingBalance.toFixed(2)}). Revise os lançamentos importados.`,
			};
		}

		return { success: true };
	} catch (error) {
		console.error("applyAccountStatementBalanceReconciliation", error);
		return {
			success: false,
			error: "Não foi possível reconciliar o saldo da conta com o extrato.",
		};
	}
}
