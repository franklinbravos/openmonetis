import { and, eq, gte, inArray, lte } from "drizzle-orm";
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
import {
	TRANSFER_ESTABLISHMENT_ENTRADA,
	TRANSFER_ESTABLISHMENT_SAIDA,
} from "@/shared/lib/transfers/constants";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString, toDateOnlyString } from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import { comparePeriods, derivePeriodFromDate } from "@/shared/utils/period";

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
	/** Pernas sintéticas de transferência removidas automaticamente na confirmação. */
	orphanSyntheticTransferCount: number;
	orphanSyntheticTransferAmount: number;
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
	transferId?: string | null;
	ofxFitId?: string | null;
};

type TransferPeerLeg = {
	id: string;
	ofxFitId: string | null;
	accountId: string | null;
};

function isTransferEstablishmentName(name: string | null | undefined): boolean {
	if (!name) return false;
	const normalized = name.trim().toLowerCase();
	return (
		normalized === TRANSFER_ESTABLISHMENT_SAIDA.toLowerCase() ||
		normalized === TRANSFER_ESTABLISHMENT_ENTRADA.toLowerCase()
	);
}

export function isSyntheticTransferLegRow(row: {
	transferId?: string | null;
	ofxFitId?: string | null;
	name: string | null;
}): boolean {
	if (!row.transferId) return false;
	if (row.ofxFitId) return false;
	return isTransferEstablishmentName(row.name);
}

export function importFileRowMatchesDbTransferLeg(
	fileRow: ImportRowSnapshot,
	leg: DbMovementRow,
): boolean {
	const legDate = toDateOnlyString(leg.purchaseDate);
	if (!legDate || fileRow.date !== legDate) return false;

	const fileSigned = signedRowAmount(fileRow);
	const legAmount = safeToNumber(leg.amount);
	return Math.abs(fileSigned - legAmount) <= SOURCE_ROUNDING_TOLERANCE;
}

export type SyntheticTransferReconciliationAdjustments = {
	excludedDbIds: Set<string>;
	orphanSyntheticLegIds: Set<string>;
	matchedSyntheticLegIdsForCleanup: Set<string>;
	matchedUnlinkedFileNet: number;
};

function resolveStatementDateBounds(balances: AccountStatementBalances): {
	start: string;
	end: string;
} {
	return {
		start: balances.periodFrom,
		end: balances.periodTo,
	};
}

function fileRowHasMatchingDbMovement(
	fileRow: ImportRowSnapshot,
	inMonthByDateRows: DbMovementRow[],
	excludedDbIds: Set<string>,
): boolean {
	return inMonthByDateRows.some(
		(leg) =>
			leg.id &&
			!excludedDbIds.has(leg.id) &&
			importFileRowMatchesDbTransferLeg(fileRow, leg),
	);
}

function dbLegDuplicatesLinkedFileRow(
	fileRow: ImportRowSnapshot,
	leg: DbMovementRow,
): boolean {
	const legDate = toDateOnlyString(leg.purchaseDate);
	if (!legDate || legDate !== fileRow.date) return false;

	const fileSigned = signedRowAmount(fileRow);
	const legAmount = safeToNumber(leg.amount);
	return Math.abs(fileSigned - legAmount) <= SOURCE_ROUNDING_TOLERANCE;
}

function preferCanonicalMatchingDbLeg(legs: DbMovementRow[]): DbMovementRow {
	return (
		legs.find((leg) => leg.ofxFitId) ??
		legs.find((leg) => !isSyntheticTransferLegRow(leg)) ??
		legs[0]
	);
}

export function resolveSyntheticTransferReconciliationAdjustments(input: {
	accountId: string;
	statementPeriod: string;
	statementDateRange?: { start: string; end: string };
	inMonthByDateRows: DbMovementRow[];
	fileRows: ImportRowSnapshot[];
	importRows?: ImportRowSnapshot[];
	peerLegsByTransferId: Map<string, TransferPeerLeg[]>;
}): SyntheticTransferReconciliationAdjustments {
	const excludedDbIds = new Set<string>();
	const orphanSyntheticLegIds = new Set<string>();
	const matchedSyntheticLegIdsForCleanup = new Set<string>();
	let matchedUnlinkedFileNet = 0;
	const importingRowKeys = new Set(
		(input.importRows ?? [])
			.filter((row) =>
				isImportRowInStatementMonth(
					row,
					input.statementPeriod,
					input.statementDateRange,
				),
			)
			.map(
				(row) =>
					`${row.date}|${row.amount}|${row.transactionType}|${row.description}`,
			),
	);

	for (const fileRow of input.fileRows) {
		if (!fileRow.existingTransactionId) continue;
		if (
			!isImportRowInStatementMonth(
				fileRow,
				input.statementPeriod,
				input.statementDateRange,
			)
		) {
			continue;
		}

		excludedDbIds.add(fileRow.existingTransactionId);

		for (const leg of input.inMonthByDateRows) {
			if (!leg.id || leg.id === fileRow.existingTransactionId) continue;
			if (!dbLegDuplicatesLinkedFileRow(fileRow, leg)) continue;

			excludedDbIds.add(leg.id);
			matchedSyntheticLegIdsForCleanup.add(leg.id);
		}
	}

	for (const leg of input.inMonthByDateRows) {
		if (!leg.id || !isSyntheticTransferLegRow(leg)) continue;
		if (excludedDbIds.has(leg.id)) continue;

		const coveringFileRow = input.fileRows.find(
			(fileRow) =>
				isImportRowInStatementMonth(
					fileRow,
					input.statementPeriod,
					input.statementDateRange,
				) && importFileRowMatchesDbTransferLeg(fileRow, leg),
		);

		if (coveringFileRow) {
			excludedDbIds.add(leg.id);
			const explicitlyLinkedToThisLeg =
				coveringFileRow.existingTransactionId === leg.id;
			const importKey = `${coveringFileRow.date}|${coveringFileRow.amount}|${coveringFileRow.transactionType}|${coveringFileRow.description}`;
			const alreadyInDb = fileRowHasMatchingDbMovement(
				coveringFileRow,
				input.inMonthByDateRows,
				excludedDbIds,
			);

			if (
				!explicitlyLinkedToThisLeg &&
				!importingRowKeys.has(importKey) &&
				!alreadyInDb
			) {
				matchedUnlinkedFileNet = roundMoney(
					matchedUnlinkedFileNet + signedRowAmount(coveringFileRow),
				);
			} else if (
				!explicitlyLinkedToThisLeg &&
				(alreadyInDb || coveringFileRow.existingTransactionId)
			) {
				matchedSyntheticLegIdsForCleanup.add(leg.id);
			}
			continue;
		}

		if (!leg.transferId) continue;
		const peers = input.peerLegsByTransferId.get(leg.transferId) ?? [];
		const otherLegs = peers.filter((peer) => peer.id !== leg.id);
		const peerOnOtherAccount = otherLegs.some(
			(peer) => peer.accountId && peer.accountId !== input.accountId,
		);
		/*
		 * Perna sem par nenhum também é órfã — mais claramente, aliás:
		 * transferência de uma ponta só não existe. Exigir par em outra conta
		 * deixava passar a perna cujo outro lado foi apagado, e ela caía no balde
		 * genérico de "lançamentos que não estão no extrato", que o app só sabe
		 * apontar. No extrato Inter de setembro/2026 isso era R$ 1,23 travando a
		 * conferência de um arquivo que fecha ao centavo.
		 *
		 * Perna cujo único par está nesta mesma conta continua de fora: aí há
		 * transferência de verdade, ainda que malformada.
		 */
		if (otherLegs.length > 0 && !peerOnOtherAccount) continue;

		excludedDbIds.add(leg.id);
		orphanSyntheticLegIds.add(leg.id);
	}

	for (const fileRow of input.fileRows) {
		if (fileRow.existingTransactionId) continue;
		if (
			!isImportRowInStatementMonth(
				fileRow,
				input.statementPeriod,
				input.statementDateRange,
			)
		) {
			continue;
		}

		const importKey = `${fileRow.date}|${fileRow.amount}|${fileRow.transactionType}|${fileRow.description}`;
		if (importingRowKeys.has(importKey)) continue;

		const matchingLegs = input.inMonthByDateRows.filter(
			(leg) =>
				leg.id &&
				!excludedDbIds.has(leg.id) &&
				dbLegDuplicatesLinkedFileRow(fileRow, leg),
		);

		if (matchingLegs.length === 0) continue;

		const canonicalLeg = preferCanonicalMatchingDbLeg(matchingLegs);

		for (const leg of matchingLegs) {
			if (!leg.id || leg.id === canonicalLeg.id) continue;
			excludedDbIds.add(leg.id);
			matchedSyntheticLegIdsForCleanup.add(leg.id);
		}

		// `Boolean(...)` não estreita o tipo; a comparação explícita, sim.
		const canonicalStillCounts =
			canonicalLeg.id !== undefined &&
			!excludedDbIds.has(canonicalLeg.id) &&
			!importingRowKeys.has(importKey);

		if (!canonicalStillCounts) {
			matchedUnlinkedFileNet = roundMoney(
				matchedUnlinkedFileNet + signedRowAmount(fileRow),
			);
		}
	}

	return {
		excludedDbIds,
		orphanSyntheticLegIds,
		matchedSyntheticLegIdsForCleanup,
		matchedUnlinkedFileNet: roundMoney(matchedUnlinkedFileNet),
	};
}

async function fetchTransferPeerLegsByTransferId(
	dataOwnerUserId: string,
	transferIds: string[],
): Promise<Map<string, TransferPeerLeg[]>> {
	if (transferIds.length === 0) return new Map();

	const rows = await db.query.transactions.findMany({
		columns: {
			id: true,
			transferId: true,
			ofxFitId: true,
			accountId: true,
		},
		where: and(
			eq(transactions.userId, dataOwnerUserId),
			inArray(transactions.transferId, transferIds),
		),
	});

	const peerLegsByTransferId = new Map<string, TransferPeerLeg[]>();
	for (const row of rows) {
		if (!row.transferId) continue;
		const legs = peerLegsByTransferId.get(row.transferId) ?? [];
		legs.push({
			id: row.id,
			ofxFitId: row.ofxFitId,
			accountId: row.accountId,
		});
		peerLegsByTransferId.set(row.transferId, legs);
	}

	return peerLegsByTransferId;
}

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
	statementDateRange?: { start: string; end: string },
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
	if (derivePeriodFromDate(row.date) !== statementPeriod) return false;
	if (
		statementDateRange &&
		(row.date < statementDateRange.start || row.date > statementDateRange.end)
	) {
		return false;
	}
	return true;
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
	statementDateRange?: { start: string; end: string };
	inMonthByDateRows: DbMovementRow[];
	importRows: ImportRowSnapshot[];
	fileRows: ImportRowSnapshot[];
	yieldAmount: number;
	syntheticTransferAdjustments?: SyntheticTransferReconciliationAdjustments;
}): number {
	const linkedExistingIds = new Set(
		input.fileRows
			.filter(
				(row) =>
					row.existingTransactionId &&
					isImportRowInStatementMonth(
						row,
						input.statementPeriod,
						input.statementDateRange,
					),
			)
			.map((row) => row.existingTransactionId as string),
	);

	const linkedFileNet = roundMoney(
		input.fileRows.reduce((total, row) => {
			if (
				!row.existingTransactionId ||
				!isImportRowInStatementMonth(
					row,
					input.statementPeriod,
					input.statementDateRange,
				)
			) {
				return total;
			}
			return total + signedRowAmount(row);
		}, 0),
	);

	const importNetInStatement = roundMoney(
		input.importRows.reduce((total, row) => {
			if (
				!isImportRowInStatementMonth(
					row,
					input.statementPeriod,
					input.statementDateRange,
				)
			) {
				return total;
			}
			return total + signedRowAmount(row);
		}, 0),
	);

	const excludedDbIds = new Set([
		...linkedExistingIds,
		...(input.syntheticTransferAdjustments?.excludedDbIds ?? []),
	]);

	const dbNetExcludingLinked = sumDbMovementRows(
		input.inMonthByDateRows.filter(
			(row) => !row.id || !excludedDbIds.has(row.id),
		),
	);

	return roundMoney(
		importNetInStatement +
			linkedFileNet +
			(input.syntheticTransferAdjustments?.matchedUnlinkedFileNet ?? 0) +
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
	const statementDateRange = resolveStatementDateBounds(input.balances);
	const { period: previousPeriod, date: previousPeriodLastDate } =
		resolveBalanceAdjustmentPlacement(statementPeriod);
	const adminPayerId = await getAdminPayerId(input.viewerUserId);
	if (!adminPayerId) return null;

	const yieldAmount = computeStatementYieldGap(input.balances, input.fileRows);
	const yieldDate =
		yieldAmount > SOURCE_ROUNDING_TOLERANCE ? statementDateRange.start : null;

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
				transferId: true,
				ofxFitId: true,
			},
			where: and(
				eq(transactions.userId, input.dataOwnerUserId),
				eq(transactions.accountId, input.accountId),
				eq(transactions.isSettled, true),
				gte(
					transactions.purchaseDate,
					parseLocalDateString(statementDateRange.start),
				),
				lte(
					transactions.purchaseDate,
					parseLocalDateString(statementDateRange.end),
				),
			),
		}),
	]);

	const { inMonthByDateRows, misfiledForwardPeriodRows, outOfMonthRows } =
		partitionStatementMonthDbRows(
			statementDateRangeRows,
			statementPeriod,
			statementDateRange.start,
			statementDateRange.end,
		);
	const outOfMonthRowAmount = sumDbMovementRows(outOfMonthRows);

	const transferIds = [
		...new Set(
			inMonthByDateRows
				.map((row) => row.transferId)
				.filter((transferId): transferId is string => Boolean(transferId)),
		),
	];
	const peerLegsByTransferId = await fetchTransferPeerLegsByTransferId(
		input.dataOwnerUserId,
		transferIds,
	);
	const syntheticTransferAdjustments =
		resolveSyntheticTransferReconciliationAdjustments({
			accountId: input.accountId,
			statementPeriod,
			statementDateRange,
			inMonthByDateRows,
			fileRows: input.fileRows,
			importRows: input.importedRows,
			peerLegsByTransferId,
		});
	const orphanSyntheticTransferAmount = roundMoney(
		inMonthByDateRows.reduce((total, row) => {
			if (
				!row.id ||
				!(
					syntheticTransferAdjustments.orphanSyntheticLegIds.has(row.id) ||
					syntheticTransferAdjustments.matchedSyntheticLegIdsForCleanup.has(
						row.id,
					)
				)
			) {
				return total;
			}
			return total + safeToNumber(row.amount);
		}, 0),
	);

	const statementMonthNetFromFile = computeStatementMonthNetFromFileRows(
		input.fileRows,
		statementPeriod,
		statementDateRange,
	);
	const statementMonthNetInCadastro = computeStatementMonthNetInCadastro({
		statementPeriod,
		statementDateRange,
		inMonthByDateRows,
		importRows: input.importedRows,
		fileRows: input.fileRows,
		yieldAmount,
		syntheticTransferAdjustments,
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
		orphanSyntheticTransferCount:
			syntheticTransferAdjustments.orphanSyntheticLegIds.size +
			syntheticTransferAdjustments.matchedSyntheticLegIdsForCleanup.size,
		orphanSyntheticTransferAmount,
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
	const statementDateRange = resolveStatementDateBounds(input.balances);
	const reconciliationFileRows = input.fileRows ?? input.importedRows;
	const yieldGap = computeStatementYieldGap(
		input.balances,
		reconciliationFileRows,
	);

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
						parseLocalDateString(statementDateRange.start),
					),
					lte(
						transactions.purchaseDate,
						parseLocalDateString(statementDateRange.end),
					),
				),
			});
			const { misfiledForwardPeriodRows } = partitionStatementMonthDbRows(
				misfiledCandidates,
				statementPeriod,
				statementDateRange.start,
				statementDateRange.end,
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

				const statementStart = statementDateRange.start;

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
				transferId: true,
				ofxFitId: true,
			},
			where: and(
				eq(transactions.userId, input.dataOwnerUserId),
				eq(transactions.accountId, input.accountId),
				eq(transactions.isSettled, true),
				gte(
					transactions.purchaseDate,
					parseLocalDateString(statementDateRange.start),
				),
				lte(
					transactions.purchaseDate,
					parseLocalDateString(statementDateRange.end),
				),
			),
		});
		const { inMonthByDateRows } = partitionStatementMonthDbRows(
			statementDateRangeRows,
			statementPeriod,
			statementDateRange.start,
			statementDateRange.end,
		);
		const transferIds = [
			...new Set(
				inMonthByDateRows
					.map((row) => row.transferId)
					.filter((transferId): transferId is string => Boolean(transferId)),
			),
		];
		const peerLegsByTransferId = await fetchTransferPeerLegsByTransferId(
			input.dataOwnerUserId,
			transferIds,
		);
		const syntheticTransferAdjustments =
			resolveSyntheticTransferReconciliationAdjustments({
				accountId: input.accountId,
				statementPeriod,
				statementDateRange,
				inMonthByDateRows,
				fileRows: reconciliationFileRows,
				importRows: input.importedRows,
				peerLegsByTransferId,
			});
		const syntheticLegIdsToDelete = [
			...new Set([
				...syntheticTransferAdjustments.orphanSyntheticLegIds,
				...syntheticTransferAdjustments.matchedSyntheticLegIdsForCleanup,
			]),
		];

		if (syntheticLegIdsToDelete.length > 0) {
			await db
				.delete(transactions)
				.where(
					and(
						eq(transactions.userId, input.dataOwnerUserId),
						eq(transactions.accountId, input.accountId),
						inArray(transactions.id, syntheticLegIdsToDelete),
					),
				);
		}

		const refreshedStatementDateRangeRows =
			syntheticLegIdsToDelete.length > 0
				? await db.query.transactions.findMany({
						columns: {
							id: true,
							amount: true,
							purchaseDate: true,
							name: true,
							period: true,
							transferId: true,
							ofxFitId: true,
						},
						where: and(
							eq(transactions.userId, input.dataOwnerUserId),
							eq(transactions.accountId, input.accountId),
							eq(transactions.isSettled, true),
							gte(
								transactions.purchaseDate,
								parseLocalDateString(statementDateRange.start),
							),
							lte(
								transactions.purchaseDate,
								parseLocalDateString(statementDateRange.end),
							),
						),
					})
				: statementDateRangeRows;
		const { inMonthByDateRows: refreshedInMonthByDateRows } =
			partitionStatementMonthDbRows(
				refreshedStatementDateRangeRows,
				statementPeriod,
				statementDateRange.start,
				statementDateRange.end,
			);
		const refreshedAdjustments =
			resolveSyntheticTransferReconciliationAdjustments({
				accountId: input.accountId,
				statementPeriod,
				statementDateRange,
				inMonthByDateRows: refreshedInMonthByDateRows,
				fileRows: reconciliationFileRows,
				importRows: input.importedRows,
				peerLegsByTransferId,
			});
		const yieldAmount = computeStatementYieldGap(
			input.balances,
			reconciliationFileRows,
		);
		const statementMonthNetInCadastro = computeStatementMonthNetInCadastro({
			statementPeriod,
			statementDateRange,
			inMonthByDateRows: refreshedInMonthByDateRows,
			importRows: [],
			fileRows: reconciliationFileRows,
			yieldAmount,
			syntheticTransferAdjustments: refreshedAdjustments,
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
