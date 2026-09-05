import { and, eq, gte, lte } from "drizzle-orm";
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
	comparePeriods,
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
	/** Lançamento já existente no cadastro (vinculado ou conferido como duplicata). */
	existingTransactionId?: string | null;
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
	/** Lançamentos datados no mês do extrato mas arquivados em período posterior. */
	misfiledForwardPeriodCount: number;
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

type DbMovementRow = {
	id?: string;
	amount: string | number;
	purchaseDate: Date;
	name: string | null;
	period: string;
};

function sumDbMovementRows(rows: DbMovementRow[]): number {
	return roundMoney(
		rows.reduce((total, row) => total + safeToNumber(row.amount), 0),
	);
}

function isPurchaseDateInStatementMonth(
	purchaseDate: Date,
	statementStart: string,
	statementEnd: string,
): boolean {
	const date = toDateOnlyString(purchaseDate);
	if (!date) return false;
	return date >= statementStart && date <= statementEnd;
}

function isImportRowInStatementMonth(
	row: Pick<ImportRowSnapshot, "date" | "description">,
	statementPeriod: string,
): boolean {
	if (
		shouldRelocateBalanceAdjustmentRow(
			row.date,
			row.description,
			statementPeriod,
		)
	) {
		return false;
	}
	return derivePeriodFromDate(row.date) === statementPeriod;
}

/**
 * Líquido do mês no cadastro para fechar com o extrato.
 *
 * Linhas vinculadas ou conferidas saem do lote de importação, mas continuam
 * valendo pelo valor do arquivo. Se o lançamento existente foi arquivado em
 * outro mês (importação retroativa), ele some da busca por data — por isso
 * somamos o arquivo nessas linhas e excluímos o id delas do movimento do banco.
 */
export function computeStatementMonthNetInCadastro(input: {
	statementPeriod: string;
	inMonthByDateRows: DbMovementRow[];
	importRows: ImportRowSnapshot[];
	fileRows: ImportRowSnapshot[];
	yieldAmount: number;
}): number {
	const linkedExistingIds = new Set(
		input.fileRows
			.filter(
				(row) =>
					row.existingTransactionId &&
					isImportRowInStatementMonth(row, input.statementPeriod),
			)
			.map((row) => row.existingTransactionId as string),
	);

	const linkedFileNet = roundMoney(
		input.fileRows.reduce((total, row) => {
			if (
				!row.existingTransactionId ||
				!isImportRowInStatementMonth(row, input.statementPeriod)
			) {
				return total;
			}
			return total + signedRowAmount(row);
		}, 0),
	);

	const importNetInStatement = roundMoney(
		input.importRows.reduce((total, row) => {
			if (!isImportRowInStatementMonth(row, input.statementPeriod)) {
				return total;
			}
			return total + signedRowAmount(row);
		}, 0),
	);

	const dbNetExcludingLinked = sumDbMovementRows(
		input.inMonthByDateRows.filter(
			(row) => !row.id || !linkedExistingIds.has(row.id),
		),
	);

	return roundMoney(
		importNetInStatement +
			linkedFileNet +
			dbNetExcludingLinked +
			input.yieldAmount,
	);
}

export function partitionStatementMonthDbRows(
	rows: DbMovementRow[],
	statementPeriod: string,
	statementStart: string,
	statementEnd: string,
) {
	const movementRows = rows.filter(
		(row) => !isAccountBalanceAdjustmentLabel(row.name),
	);
	const inMonthByDateRows = movementRows.filter((row) =>
		isPurchaseDateInStatementMonth(
			row.purchaseDate,
			statementStart,
			statementEnd,
		),
	);
	const misfiledForwardPeriodRows = inMonthByDateRows.filter(
		(row) => comparePeriods(row.period, statementPeriod) > 0,
	);
	const outOfMonthRows = movementRows.filter(
		(row) =>
			row.period === statementPeriod &&
			!isPurchaseDateInStatementMonth(
				row.purchaseDate,
				statementStart,
				statementEnd,
			),
	);

	return {
		inMonthByDateRows,
		misfiledForwardPeriodRows,
		outOfMonthRows,
	};
}

/**
 * Linhas do arquivo que movimentam o saldo da conta.
 *
 * Pagamento de fatura entra: o dinheiro sai da conta corrente como qualquer
 * outra despesa, e o extrato o registra como registra as demais. Deixá-lo de
 * fora fazia o líquido do arquivo discordar do próprio extrato — no extrato
 * Inter de agosto/2026, o débito automático da fatura de R$ 78,00 sumia e o
 * líquido dava −R$ 938,99 contra os −R$ 1.016,99 que os saldos declaram.
 *
 * Fora fica só o que não é dinheiro saindo ou entrando na conta: linha de
 * excesso da conciliação de fatura (`invoice_extra`).
 */
export function isAccountStatementMovementImportRow(kind: string): boolean {
	return (
		kind === "transaction" || kind === "transfer" || kind === "invoice_payment"
	);
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
	const statementBounds = getPeriodPurchaseDateBounds(statementPeriod);
	const { period: previousPeriod, date: previousPeriodLastDate } =
		resolveBalanceAdjustmentPlacement(statementPeriod);
	const adminPayerId = await getAdminPayerId(input.viewerUserId);
	if (!adminPayerId) return null;

	const yieldAmount = computeStatementYieldGap(input.balances, input.fileRows);
	const yieldDate =
		yieldAmount > SOURCE_ROUNDING_TOLERANCE ? statementBounds.start : null;

	const [
		misplacedAdjustments,
		existingPreviousAdjustment,
		previousSummary,
		statementDateRangeRows,
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
		db.query.transactions.findMany({
			columns: {
				id: true,
				amount: true,
				purchaseDate: true,
				name: true,
				period: true,
			},
			where: and(
				eq(transactions.userId, input.dataOwnerUserId),
				eq(transactions.accountId, input.accountId),
				eq(transactions.isSettled, true),
				gte(
					transactions.purchaseDate,
					parseLocalDateString(statementBounds.start),
				),
				lte(
					transactions.purchaseDate,
					parseLocalDateString(statementBounds.end),
				),
			),
		}),
	]);

	const { inMonthByDateRows, misfiledForwardPeriodRows, outOfMonthRows } =
		partitionStatementMonthDbRows(
			statementDateRangeRows,
			statementPeriod,
			statementBounds.start,
			statementBounds.end,
		);
	const outOfMonthRowAmount = sumDbMovementRows(outOfMonthRows);

	const statementMonthNetFromFile = computeStatementMonthNetFromFileRows(
		input.fileRows,
		statementPeriod,
	);
	const statementMonthNetInCadastro = computeStatementMonthNetInCadastro({
		statementPeriod,
		inMonthByDateRows,
		importRows: input.importedRows,
		fileRows: input.fileRows,
		yieldAmount,
	});

	const existingPreviousAdjustmentAmount = Number(
		existingPreviousAdjustment?.amount ?? 0,
	);
	const basePreviousBalance = roundMoney(
		previousSummary.currentBalance - existingPreviousAdjustmentAmount,
	);
	const previousBalanceInCadastro = basePreviousBalance;
	const adjustmentAmount = roundMoney(
		input.balances.openingBalance - previousBalanceInCadastro,
	);

	const projectedClosingBalance = roundMoney(
		input.balances.openingBalance + statementMonthNetInCadastro,
	);
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
			statementMonthNetInCadastro - statementMonthNetFromFile,
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
		misfiledForwardPeriodCount: misfiledForwardPeriodRows.length,
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
	/** Todas as linhas do extrato, com ids de lançamentos vinculados/conferidos. */
	fileRows?: ImportRowSnapshot[];
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
	const statementBounds = getPeriodPurchaseDateBounds(statementPeriod);
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

			const misfiledCandidates = await tx.query.transactions.findMany({
				columns: {
					id: true,
					amount: true,
					period: true,
					purchaseDate: true,
					name: true,
				},
				where: and(
					eq(transactions.userId, input.dataOwnerUserId),
					eq(transactions.accountId, input.accountId),
					eq(transactions.isSettled, true),
					gte(
						transactions.purchaseDate,
						parseLocalDateString(statementBounds.start),
					),
					lte(
						transactions.purchaseDate,
						parseLocalDateString(statementBounds.end),
					),
				),
			});
			const { misfiledForwardPeriodRows } = partitionStatementMonthDbRows(
				misfiledCandidates,
				statementPeriod,
				statementBounds.start,
				statementBounds.end,
			);

			for (const row of misfiledForwardPeriodRows) {
				if (!row.id) continue;
				await tx
					.update(transactions)
					.set({ period: statementPeriod })
					.where(eq(transactions.id, row.id));
			}

			if (yieldGap > SOURCE_ROUNDING_TOLERANCE) {
				const yieldCategory = await tx.query.categories.findFirst({
					columns: { id: true },
					where: and(
						eq(categories.userId, input.dataOwnerUserId),
						eq(categories.name, ACCOUNT_YIELD_CATEGORY_NAME),
					),
				});

				const statementStart = statementBounds.start;

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

		const statementDateRangeRows = await db.query.transactions.findMany({
			columns: {
				id: true,
				amount: true,
				purchaseDate: true,
				name: true,
				period: true,
			},
			where: and(
				eq(transactions.userId, input.dataOwnerUserId),
				eq(transactions.accountId, input.accountId),
				eq(transactions.isSettled, true),
				gte(
					transactions.purchaseDate,
					parseLocalDateString(statementBounds.start),
				),
				lte(
					transactions.purchaseDate,
					parseLocalDateString(statementBounds.end),
				),
			),
		});
		const { inMonthByDateRows } = partitionStatementMonthDbRows(
			statementDateRangeRows,
			statementPeriod,
			statementBounds.start,
			statementBounds.end,
		);
		const reconciliationFileRows = input.fileRows ?? input.importedRows;
		const yieldAmount = computeStatementYieldGap(
			input.balances,
			reconciliationFileRows,
		);
		const statementMonthNetInCadastro = computeStatementMonthNetInCadastro({
			statementPeriod,
			inMonthByDateRows,
			importRows: [],
			fileRows: reconciliationFileRows,
			yieldAmount,
		});
		const projectedClosingBalance = roundMoney(
			input.balances.openingBalance + statementMonthNetInCadastro,
		);
		const closingDelta = roundMoney(
			projectedClosingBalance - input.balances.closingBalance,
		);

		if (Math.abs(closingDelta) > SOURCE_ROUNDING_TOLERANCE) {
			return {
				success: false,
				error: `Saldo final do mês (${projectedClosingBalance.toFixed(2)}) não bate com o extrato (${input.balances.closingBalance.toFixed(2)}). Revise os lançamentos importados.`,
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
