"use server";

import { randomUUID } from "node:crypto";
import {
	and,
	eq,
	gte,
	ilike,
	inArray,
	isNotNull,
	isNull,
	lte,
	or,
} from "drizzle-orm";
import { z } from "zod";
import {
	attachments,
	cards,
	categories,
	financialAccounts,
	importBatches,
	transactions,
} from "@/db/schema";
import {
	type AccountStatementBalancePreview,
	applyAccountStatementBalanceReconciliation,
	previewAccountStatementBalanceReconciliation,
} from "@/features/accounts/lib/statement-balance-reconciliation";
import {
	registerInvoiceAmortizationsAction,
	updateInvoicePaymentStatusAction,
} from "@/features/invoices/actions";
import {
	buildTransactionRecords,
	fetchOwnedCategoryIds,
	fetchOwnedPayerIds,
	type TransactionInsert,
	validateCartaoOwnership,
	validateContaOwnership,
} from "@/features/transactions/actions/core";
import {
	amountEditToSignedStored,
	dedupeExistingAmountEdits,
	dedupeExistingInstallmentEdits,
	type ExistingAmountEdit,
	type ExistingInstallmentEdit,
} from "@/features/transactions/lib/import-amount-edit";
import { IMPORT_BATCH_STATUS } from "@/features/transactions/lib/import-batch-status";
import type { ImportDuplicateSnapshot } from "@/features/transactions/lib/import-duplicate-match";
import {
	buildInstallmentOccurrenceKey,
	buildInstallmentSeriesKey,
	getInstallmentBasePeriod,
	resolveInstallmentPurchaseDate,
} from "@/features/transactions/lib/import-installments";
import { isPeriodLockedTransaction } from "@/features/transactions/lib/import-move-period";
import {
	buildInvoicePaymentNote,
	INVOICE_ADJUSTMENT_NAME,
} from "@/shared/lib/accounts/constants";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { INVOICE_PAYMENT_CATEGORY_NAME } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import {
	deriveStatementPeriodFromBalances,
	getPreviousPeriodLastDate,
	shouldRelocateBalanceAdjustmentRow,
} from "@/shared/lib/import/account-statement-balances";
import {
	expandImportExternalIdsForLookup,
	type ImportOccurrenceIdentity,
	importExternalIdCollidesWithStored,
	importOccurrenceCollidesWithStored,
	planImportRecordInsertion,
} from "@/shared/lib/import/helpers";
import { isInvoicePaymentDescription } from "@/shared/lib/import/invoice-total";
import { resolveImportRowPeriod } from "@/shared/lib/import/period";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { periodSchema, uuidSchema } from "@/shared/lib/schemas/common";
import { deleteS3Object } from "@/shared/lib/storage/presign";
import { toDbColumnNames } from "@/shared/lib/supabase/drizzle-bridge";
import { callRpc } from "@/shared/lib/supabase/rpc";
import {
	TRANSFER_CATEGORY_NAME,
	TRANSFER_CONDITION,
	TRANSFER_ESTABLISHMENT_ENTRADA,
	TRANSFER_ESTABLISHMENT_SAIDA,
	TRANSFER_PAYMENT_METHOD,
} from "@/shared/lib/transfers/constants";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString, toDateOnlyString } from "@/shared/utils/date";
import { addMonthsToPeriod } from "@/shared/utils/period";

const installmentImportSchema = z
	.object({
		enabled: z.literal(true),
		name: z.string().trim().min(1, "Nome do parcelamento obrigatório."),
		currentInstallment: z.number().int().min(1).max(60),
		installmentCount: z.number().int().min(2).max(60),
	})
	.superRefine((value, ctx) => {
		if (value.currentInstallment > value.installmentCount) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Parcela atual inválida.",
				path: ["currentInstallment"],
			});
		}
	});

const recurrenceImportSchema = z.object({
	enabled: z.literal(true),
	recurrenceCount: z.number().int().min(2).max(60),
});

const importRowSchema = z
	.object({
		externalId: z.string().nullable(),
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
		amount: z.number().positive(),
		description: z.string().min(1, "Descrição obrigatória."),
		transactionType: z.enum(["income", "expense"]),
		categoryId: uuidSchema("Categoria").nullable().optional(),
		payerId: uuidSchema("Payer").nullable().optional(),
		kind: z
			.enum(["transaction", "invoice_payment", "transfer"])
			.default("transaction"),
		invoicePaymentCardId: uuidSchema("Cartão").nullable().optional(),
		invoicePaymentPeriod: z
			.string()
			.regex(/^\d{4}-\d{2}$/, "Período inválido.")
			.nullable()
			.optional(),
		transferPeerAccountId: uuidSchema("Conta").nullable().optional(),
		installmentImport: installmentImportSchema.nullable().optional(),
		recurrenceImport: recurrenceImportSchema.nullable().optional(),
	})
	.superRefine((row, ctx) => {
		if (row.kind === "invoice_payment") {
			if (!row.invoicePaymentCardId) {
				ctx.addIssue({
					code: "custom",
					message: "Cartão obrigatório para pagamento de fatura.",
					path: ["invoicePaymentCardId"],
				});
			}

			if (!row.invoicePaymentPeriod) {
				ctx.addIssue({
					code: "custom",
					message: "Período da fatura obrigatório.",
					path: ["invoicePaymentPeriod"],
				});
			}
			return;
		}

		if (row.kind !== "transfer") return;

		if (!row.transferPeerAccountId) {
			ctx.addIssue({
				code: "custom",
				message: "Conta obrigatória para transferência.",
				path: ["transferPeerAccountId"],
			});
		}
	});

const existingAmountEditSchema = z.object({
	transactionId: uuidSchema("Lançamento"),
	amount: z.number().positive(),
});

const existingInstallmentEditSchema = z.object({
	transactionId: uuidSchema("Lançamento"),
	currentInstallment: z.number().int().positive(),
	installmentCount: z.number().int().positive(),
});

/**
 * Liquidação da fatura anterior, deduzida do arquivo desta.
 *
 * Chega da revisão já conferida pelo usuário: quanto foi pago na fatura
 * anterior e quanto dela rolou para esta. Aplicar isso na importação corrige o
 * registro do mês anterior, que ficava marcado como pago por inteiro e com um
 * débito na conta por um valor que nunca saiu dela.
 */
const previousInvoiceSettlementSchema = z.object({
	period: z
		.string()
		.regex(/^\d{4}-\d{2}$/, "Período da fatura anterior inválido."),
	paidAmount: z.number().nonnegative(),
	carriedOver: z.number().nonnegative(),
	paymentTransactionId: uuidSchema("Lançamento").nullable().optional(),
	/** Data em que o banco recebeu, declarada no arquivo. */
	paymentDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Data do pagamento inválida.")
		.nullable()
		.optional(),
});

/**
 * Status da fatura anterior a partir do que sobrou dela.
 *
 * Nada carregado significa quitada; carregado sem pagamento, pendente. A
 * tolerância de um centavo absorve o arredondamento do banco.
 */
function resolveSettlementStatus(settlement: {
	paidAmount: number;
	carriedOver: number;
}): string {
	if (settlement.carriedOver <= 0.01) return INVOICE_PAYMENT_STATUS.PAID;
	if (settlement.paidAmount <= 0.01) return INVOICE_PAYMENT_STATUS.PENDING;
	return INVOICE_PAYMENT_STATUS.PARTIAL;
}

/**
 * Pagamentos do arquivo que abateram a fatura sendo importada.
 *
 * Só o arquivo do mês seguinte revela um abate feito antes do vencimento. Até
 * aqui a revisão o exibia e ninguém o gravava: o dinheiro saía da conta e o
 * extrato só mostrava a saída no vencimento, num valor que nunca saiu de uma vez.
 */
const invoiceAmortizationSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data do pagamento inválida."),
	amount: z.number().positive(),
});

const accountStatementBalancesSchema = z.object({
	openingBalance: z.number(),
	closingBalance: z.number(),
	yield: z.number().optional(),
	totalIn: z.number().nullable().optional(),
	totalOut: z.number().nullable().optional(),
	periodFrom: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Início do extrato inválido."),
	periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fim do extrato inválido."),
	balances: z.boolean(),
});

const importSchema = z
	.object({
		rows: z.array(importRowSchema),
		payerId: uuidSchema("Payer").nullable().optional(),
		accountId: uuidSchema("FinancialAccount").nullable().optional(),
		cardId: uuidSchema("Cartão").nullable().optional(),
		paymentMethod: z.string().min(1),
		invoicePeriod: z
			.string()
			.regex(/^\d{4}-\d{2}$/, "Período inválido.")
			.nullable()
			.optional(),
		payInvoice: z.boolean().optional(),
		paymentDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Data de pagamento inválida.")
			.optional(),
		paymentAccountId: uuidSchema("FinancialAccount").nullable().optional(),
		sourceFileName: z.string().trim().min(1).optional(),
		sourceFileSize: z.number().int().positive().optional(),
		importBatchId: z.string().uuid().optional(),
		sourceInvoiceTotalOverride: z.boolean().optional(),
		removeTransactionIds: z.array(z.string().uuid()).optional(),
		existingAmountEdits: z.array(existingAmountEditSchema).optional(),
		existingInstallmentEdits: z.array(existingInstallmentEditSchema).optional(),
		previousInvoiceSettlement: previousInvoiceSettlementSchema.optional(),
		invoiceAmortizations: z.array(invoiceAmortizationSchema).optional(),
		accountStatementBalances: accountStatementBalancesSchema.optional(),
	})
	.superRefine((data, ctx) => {
		// A liquidação da fatura anterior é trabalho por si só: reprocessar um mês
		// já conferido não mexe em lançamento nenhum e ainda assim corrige o
		// status, o valor e a data do débito do mês passado. O mesmo vale para a
		// amortização, que é um lançamento novo na conta.
		if (
			data.rows.length === 0 &&
			!data.payInvoice &&
			!data.previousInvoiceSettlement &&
			!(data.invoiceAmortizations?.length ?? 0) &&
			!(data.removeTransactionIds?.length ?? 0) &&
			!(data.existingAmountEdits?.length ?? 0) &&
			!(data.existingInstallmentEdits?.length ?? 0) &&
			!(data.accountStatementBalances && data.accountId && !data.cardId)
		) {
			ctx.addIssue({
				code: "custom",
				message: "Selecione ao menos uma transação.",
				path: ["rows"],
			});
		}
	});

type ImportInput = z.infer<typeof importSchema>;

type ImportResult =
	| { success: true; imported: number; skipped: number; importBatchId: string }
	| { success: false; error: string };

function isPostgresUniqueViolation(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const record = error as { code?: string; cause?: { code?: string } };
	return record.code === "23505" || record.cause?.code === "23505";
}

// Retorna os externalIds que já existem para o usuário (para marcar duplicatas)
export async function checkDuplicateFitIds(
	fitIds: string[],
): Promise<string[]> {
	const userId = await getUserId();
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const ids = fitIds.filter(Boolean);
	if (ids.length === 0) return [];

	const lookupIds = expandImportExternalIdsForLookup(ids);

	const rows = await db
		.select({ ofxFitId: transactions.ofxFitId })
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				inArray(transactions.ofxFitId, lookupIds),
			),
		);

	const storedIds = rows
		.map((r) => r.ofxFitId)
		.filter((id): id is string => Boolean(id));

	return ids.filter((id) => importExternalIdCollidesWithStored(id, storedIds));
}

export async function fetchImportDuplicateSnapshots(fitIds: string[]) {
	const userId = await getUserId();
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const ids = fitIds.filter(Boolean);
	if (ids.length === 0) return [];

	const lookupIds = expandImportExternalIdsForLookup(ids);

	return db
		.select({
			id: transactions.id,
			ofxFitId: transactions.ofxFitId,
			name: transactions.name,
			amount: transactions.amount,
			purchaseDate: transactions.purchaseDate,
			transactionType: transactions.transactionType,
			currentInstallment: transactions.currentInstallment,
			installmentCount: transactions.installmentCount,
			payerId: transactions.payerId,
			categoryId: transactions.categoryId,
			accountId: transactions.accountId,
			transferId: transactions.transferId,
			note: transactions.note,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				inArray(transactions.ofxFitId, lookupIds),
			),
		)
		.then((rows) =>
			rows.map((row) => ({
				id: row.id,
				ofxFitId: row.ofxFitId,
				name: row.name,
				amount: row.amount,
				purchaseDate: row.purchaseDate,
				transactionType: row.transactionType,
				currentInstallment: row.currentInstallment,
				installmentCount: row.installmentCount,
				payerId: row.payerId,
				categoryId: row.categoryId,
				accountId: row.accountId,
				transferId: row.transferId,
				note: row.note,
			})),
		);
}

const mapImportDuplicateSnapshotRows = (
	rows: Array<{
		id: string;
		ofxFitId: string | null;
		name: string;
		amount: string;
		purchaseDate: Date | string;
		transactionType: string;
		currentInstallment: number | null;
		installmentCount: number | null;
		payerId: string | null;
		categoryId: string | null;
		period?: string | null;
		condition?: string | null;
		recurrenceCount?: number | null;
		note?: string | null;
	}>,
): ImportDuplicateSnapshot[] =>
	rows.map((row) => ({
		id: row.id,
		ofxFitId: row.ofxFitId,
		name: row.name,
		amount: row.amount,
		purchaseDate: row.purchaseDate,
		transactionType: row.transactionType,
		currentInstallment: row.currentInstallment,
		installmentCount: row.installmentCount,
		payerId: row.payerId,
		categoryId: row.categoryId,
		period: row.period ?? null,
		condition: row.condition ?? null,
		recurrenceCount: row.recurrenceCount ?? null,
		note: row.note ?? null,
	}));

export async function fetchInvoicePeriodDuplicateSnapshots(
	cardId: string,
	invoicePeriod: string,
) {
	const userId = await getUserId();
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	return db
		.select({
			id: transactions.id,
			ofxFitId: transactions.ofxFitId,
			name: transactions.name,
			amount: transactions.amount,
			purchaseDate: transactions.purchaseDate,
			transactionType: transactions.transactionType,
			currentInstallment: transactions.currentInstallment,
			installmentCount: transactions.installmentCount,
			payerId: transactions.payerId,
			categoryId: transactions.categoryId,
			period: transactions.period,
			condition: transactions.condition,
			recurrenceCount: transactions.recurrenceCount,
			note: transactions.note,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.cardId, cardId),
				eq(transactions.period, invoicePeriod),
			),
		)
		.then(mapImportDuplicateSnapshotRows);
}

/** Parcelas ficam em outros períodos; inclui série parcelada e linhas à vista com "parcela" no nome. */
export async function fetchCardInstallmentDuplicateSnapshots(cardId: string) {
	const userId = await getUserId();
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	return db
		.select({
			id: transactions.id,
			ofxFitId: transactions.ofxFitId,
			name: transactions.name,
			amount: transactions.amount,
			purchaseDate: transactions.purchaseDate,
			transactionType: transactions.transactionType,
			currentInstallment: transactions.currentInstallment,
			installmentCount: transactions.installmentCount,
			payerId: transactions.payerId,
			categoryId: transactions.categoryId,
			period: transactions.period,
			condition: transactions.condition,
			recurrenceCount: transactions.recurrenceCount,
			note: transactions.note,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.cardId, cardId),
				or(
					isNotNull(transactions.installmentCount),
					ilike(transactions.name, "%parcela%"),
				),
			),
		)
		.then(mapImportDuplicateSnapshotRows);
}

export async function fetchAccountImportDuplicateSnapshots(
	accountId: string,
	dateFrom: string,
	dateTo: string,
) {
	const userId = await getUserId();
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const fromDate = parseLocalDateString(dateFrom);
	const toDate = parseLocalDateString(dateTo);

	const snapshotSelect = {
		id: transactions.id,
		ofxFitId: transactions.ofxFitId,
		name: transactions.name,
		amount: transactions.amount,
		purchaseDate: transactions.purchaseDate,
		transactionType: transactions.transactionType,
		currentInstallment: transactions.currentInstallment,
		installmentCount: transactions.installmentCount,
		payerId: transactions.payerId,
		categoryId: transactions.categoryId,
		accountId: transactions.accountId,
		transferId: transactions.transferId,
		note: transactions.note,
	} as const;

	const accountRows = await db
		.select(snapshotSelect)
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				or(
					eq(transactions.accountId, accountId),
					isNull(transactions.accountId),
				),
				gte(transactions.purchaseDate, fromDate),
				lte(transactions.purchaseDate, toDate),
			),
		);

	const transferIds = [
		...new Set(
			accountRows
				.map((row) => row.transferId)
				.filter((id): id is string => Boolean(id)),
		),
	];

	let pairedLegRows: typeof accountRows = [];
	if (transferIds.length > 0) {
		pairedLegRows = await db
			.select(snapshotSelect)
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					inArray(transactions.transferId, transferIds),
				),
			);
	}

	const byId = new Map<string, (typeof accountRows)[number]>();
	for (const row of [...accountRows, ...pairedLegRows]) {
		byId.set(row.id, row);
	}

	return [...byId.values()].map((row) => ({
		id: row.id,
		ofxFitId: row.ofxFitId,
		name: row.name,
		amount: row.amount,
		purchaseDate: row.purchaseDate,
		transactionType: row.transactionType,
		currentInstallment: row.currentInstallment,
		installmentCount: row.installmentCount,
		payerId: row.payerId,
		categoryId: row.categoryId,
		accountId: row.accountId,
		transferId: row.transferId,
		note: row.note,
	}));
}

const linkImportSchema = z.object({
	existingTransactionId: uuidSchema("Lançamento"),
	importedDescription: z.string().trim().min(1, "Descrição obrigatória."),
	externalId: z.string().nullable().optional(),
	mergeDescription: z.enum(["import", "existing"]),
	fallbackPayerId: uuidSchema("Pessoa").nullable().optional(),
});

function appendReplacedNameToNote(
	existingNote: string | null,
	label: string,
	replacedName: string,
): string | null {
	const trimmed = replacedName.trim();
	if (!trimmed) return existingNote;

	const line = `${label}: ${trimmed}`;
	return existingNote ? `${existingNote}\n${line}` : line;
}

export async function linkImportToExistingAction(
	input: z.infer<typeof linkImportSchema>,
): Promise<{ success: true } | { success: false; error: string }> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
		const data = linkImportSchema.parse(input);

		const existing = await db.query.transactions.findFirst({
			columns: {
				id: true,
				name: true,
				note: true,
				ofxFitId: true,
				payerId: true,
			},
			where: and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.id, data.existingTransactionId),
			),
		});

		if (!existing) {
			return { success: false, error: "Lançamento não encontrado." };
		}

		const adminPayerId = await getAdminPayerId(userId);
		let nextPayerId = existing.payerId;

		if (!nextPayerId) {
			const candidatePayerId = data.fallbackPayerId ?? adminPayerId;
			if (candidatePayerId) {
				const ownedPayerIds = await fetchOwnedPayerIds(userId, [
					candidatePayerId,
				]);
				if (ownedPayerIds.has(candidatePayerId)) {
					nextPayerId = candidatePayerId;
				}
			}
		}

		let nextName = existing.name;
		let nextNote = existing.note;
		const imported = data.importedDescription.trim();
		const registered = existing.name.trim();

		if (data.mergeDescription === "import") {
			nextName = data.importedDescription;
			if (registered && registered !== imported) {
				nextNote = appendReplacedNameToNote(
					existing.note,
					"Cadastro",
					existing.name,
				);
			}
		} else if (imported && imported !== registered) {
			nextNote = appendReplacedNameToNote(existing.note, "Extrato", imported);
		}

		await db
			.update(transactions)
			.set({
				name: nextName,
				note: nextNote,
				ofxFitId: existing.ofxFitId ?? data.externalId ?? null,
				payerId: nextPayerId,
			})
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.id, data.existingTransactionId),
				),
			);

		await revalidateForEntity("transactions", userId);

		return { success: true };
	} catch (error) {
		console.error("linkImportToExistingAction", error);
		return { success: false, error: "Não foi possível vincular o lançamento." };
	}
}

const moveImportTransactionToPeriodSchema = z.object({
	transactionId: uuidSchema("Lançamento"),
	period: periodSchema,
});

export async function moveImportTransactionToPeriodAction(input: {
	transactionId: string;
	period: string;
}): Promise<{ success: boolean; error?: string }> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
		const data = moveImportTransactionToPeriodSchema.parse(input);

		const existing = await db.query.transactions.findFirst({
			columns: {
				id: true,
				name: true,
				period: true,
				transactionType: true,
				condition: true,
				paymentMethod: true,
				installmentCount: true,
				recurrenceCount: true,
			},
			where: and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.id, data.transactionId),
			),
		});

		if (!existing) {
			return { success: false, error: "Lançamento não encontrado." };
		}

		if (
			isInvoicePaymentDescription(existing.name) ||
			existing.name === INVOICE_ADJUSTMENT_NAME
		) {
			return {
				success: false,
				error: "Não é possível mover 'Pagamento fatura' ou 'Ajuste de fatura'.",
			};
		}

		if (isPeriodLockedTransaction(existing)) {
			return {
				success: false,
				error:
					"Não é possível mover parcelas nem lançamentos recorrentes por aqui. Cada ocorrência pertence ao mês em que cai — se o período estiver errado, corrija o lançamento na tela de lançamentos.",
			};
		}

		await db
			.update(transactions)
			.set({ period: data.period })
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.id, data.transactionId),
				),
			);

		console.info("moveImportTransactionToPeriodAction:moved", {
			transactionId: existing.id,
			fromPeriod: existing.period,
			toPeriod: data.period,
		});

		await revalidateForEntity("transactions", userId);

		return { success: true };
	} catch (error) {
		console.error("moveImportTransactionToPeriodAction", error);
		return { success: false, error: "Não foi possível mover o lançamento." };
	}
}

export async function deleteImportDuplicateTransaction(
	transactionId: string,
): Promise<{ success: boolean; error?: string }> {
	if (!transactionId) return { success: false, error: "Lançamento inválido." };

	const userId = await getUserId();
	const { dataOwnerUserId } = await assertFinancialEditAccess(userId);

	const deleted = await db
		.delete(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.id, transactionId),
			),
		)
		.returning({ id: transactions.id });

	if (deleted.length === 0) {
		return { success: false, error: "Lançamento não encontrado." };
	}

	await revalidateForEntity("transactions", userId);

	return { success: true };
}

type ValidatedAmountEdit = ExistingAmountEdit & {
	transactionType: string;
};

type AmountEditValidationResult =
	| { success: true; edits: ValidatedAmountEdit[] }
	| { success: false; error: string };

async function validateExistingAmountEdits(
	client: Pick<typeof db, "query">,
	dataOwnerUserId: string,
	edits: ExistingAmountEdit[],
): Promise<AmountEditValidationResult> {
	const ownedTransactions = await client.query.transactions.findMany({
		columns: { id: true, name: true, transactionType: true },
		where: and(
			eq(transactions.userId, dataOwnerUserId),
			inArray(
				transactions.id,
				edits.map((edit) => edit.transactionId),
			),
		),
	});

	if (ownedTransactions.length !== edits.length) {
		return {
			success: false,
			error: "Um ou mais lançamentos a corrigir não foram encontrados.",
		};
	}

	const transactionById = new Map(
		ownedTransactions.map((transaction) => [transaction.id, transaction]),
	);

	for (const edit of edits) {
		const transaction = transactionById.get(edit.transactionId);
		if (!transaction) continue;
		if (
			isInvoicePaymentDescription(transaction.name) ||
			transaction.name === INVOICE_ADJUSTMENT_NAME
		) {
			return {
				success: false,
				error:
					"Não é possível corrigir o valor de 'Pagamento fatura' ou 'Ajuste de fatura'.",
			};
		}
	}

	return {
		success: true,
		edits: edits.map((edit) => ({
			...edit,
			transactionType:
				transactionById.get(edit.transactionId)?.transactionType ?? "",
		})),
	};
}

async function applyExistingAmountCorrectionsT(
	client: Pick<typeof db, "update">,
	dataOwnerUserId: string,
	validatedEdits: ValidatedAmountEdit[],
): Promise<void> {
	for (const edit of validatedEdits) {
		await client
			.update(transactions)
			.set({
				amount: formatDecimalForDbRequired(
					amountEditToSignedStored(edit.amount, edit.transactionType),
				),
			})
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.id, edit.transactionId),
				),
			);
	}
}

type InstallmentEditValidationResult =
	| { success: true; edits: ExistingInstallmentEdit[] }
	| { success: false; error: string };

/**
 * Só reescreve a numeração de parcela de lançamento que já é parcelado: gravar
 * N/M em lançamento à vista sujaria os relatórios de parcelas.
 */
async function validateExistingInstallmentEdits(
	client: Pick<typeof db, "query">,
	dataOwnerUserId: string,
	edits: ExistingInstallmentEdit[],
): Promise<InstallmentEditValidationResult> {
	const ownedTransactions = await client.query.transactions.findMany({
		columns: { id: true, installmentCount: true },
		where: and(
			eq(transactions.userId, dataOwnerUserId),
			inArray(
				transactions.id,
				edits.map((edit) => edit.transactionId),
			),
		),
	});

	if (ownedTransactions.length !== edits.length) {
		return {
			success: false,
			error: "Um ou mais lançamentos a corrigir não foram encontrados.",
		};
	}

	const isInstallmentById = new Map(
		ownedTransactions.map((transaction) => [
			transaction.id,
			transaction.installmentCount != null,
		]),
	);

	return {
		success: true,
		edits: edits.filter((edit) => isInstallmentById.get(edit.transactionId)),
	};
}

async function applyExistingInstallmentCorrectionsT(
	client: Pick<typeof db, "update">,
	dataOwnerUserId: string,
	edits: ExistingInstallmentEdit[],
): Promise<void> {
	for (const edit of edits) {
		await client
			.update(transactions)
			.set({
				currentInstallment: edit.currentInstallment,
				installmentCount: edit.installmentCount,
			})
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.id, edit.transactionId),
				),
			);
	}
}

const importRowSnapshotSchema = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
	description: z.string(),
	amount: z.number().positive(),
	transactionType: z.enum(["income", "expense"]),
});

const previewBalanceReconciliationSchema = z.object({
	accountId: uuidSchema("FinancialAccount"),
	balances: accountStatementBalancesSchema,
	fileRows: z.array(importRowSnapshotSchema),
	importedRows: z.array(importRowSnapshotSchema).default([]),
});

export async function previewImportBalanceReconciliationAction(
	input: z.infer<typeof previewBalanceReconciliationSchema>,
): Promise<
	| { success: true; preview: AccountStatementBalancePreview }
	| { success: false; error: string }
> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
		const data = previewBalanceReconciliationSchema.parse(input);

		if (!(await validateContaOwnership(userId, data.accountId))) {
			return { success: false, error: "Conta não encontrada." };
		}

		const preview = await previewAccountStatementBalanceReconciliation({
			viewerUserId: userId,
			dataOwnerUserId,
			accountId: data.accountId,
			balances: data.balances,
			fileRows: data.fileRows,
			importedRows: data.importedRows,
		});

		if (!preview) {
			return {
				success: false,
				error: "O extrato não traz saldos conferíveis para ajuste automático.",
			};
		}

		return { success: true, preview };
	} catch (error) {
		console.error("previewImportBalanceReconciliationAction", error);
		return {
			success: false,
			error: "Não foi possível calcular o ajuste de saldo.",
		};
	}
}

async function finalizeAccountStatementBalanceImport(input: {
	userId: string;
	dataOwnerUserId: string;
	accountId: string;
	balances: NonNullable<ImportInput["accountStatementBalances"]>;
	importBatchId: string;
	sourceFileName?: string;
	sourceFileSize?: number;
	importedRows: Array<{
		date: string;
		description: string;
		amount: number;
		transactionType: "income" | "expense";
	}>;
}): Promise<ImportResult> {
	const reconciliation = await applyAccountStatementBalanceReconciliation({
		viewerUserId: input.userId,
		dataOwnerUserId: input.dataOwnerUserId,
		accountId: input.accountId,
		balances: input.balances,
		importedRows: input.importedRows,
	});

	if (!reconciliation.success) {
		return reconciliation;
	}

	await revalidateForEntity("transactions", input.userId);
	await revalidateForEntity("accounts", input.userId);

	const batchPayload = {
		sourceFileName: input.sourceFileName ?? "Importação sem arquivo",
		sourceFileSize: input.sourceFileSize ?? null,
		cardId: null,
		invoicePeriod: null,
		accountId: input.accountId,
		importedCount: 0,
		skippedCount: 0,
		status: IMPORT_BATCH_STATUS.IMPORTED,
		draftData: null,
	};

	const existingBatch = await db.query.importBatches.findFirst({
		columns: { id: true },
		where: and(
			eq(importBatches.userId, input.dataOwnerUserId),
			eq(importBatches.id, input.importBatchId),
		),
	});

	if (existingBatch) {
		await db
			.update(importBatches)
			.set(batchPayload)
			.where(eq(importBatches.id, input.importBatchId));
	} else {
		await db.insert(importBatches).values({
			id: input.importBatchId,
			userId: input.dataOwnerUserId,
			...batchPayload,
		});
	}

	return {
		success: true,
		imported: 0,
		skipped: 0,
		importBatchId: input.importBatchId,
	};
}

export async function importTransactionsAction(
	input: ImportInput,
): Promise<ImportResult> {
	const userId = await getUserId();
	const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
	const parsed = importSchema.safeParse(input);

	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
		};
	}

	const { rows, payerId, accountId, cardId, paymentMethod, invoicePeriod } =
		parsed.data;
	const accountStatementBalances = parsed.data.accountStatementBalances;
	const statementPeriodForBalance = accountStatementBalances
		? deriveStatementPeriodFromBalances(accountStatementBalances)
		: null;
	const previousPeriodLastDate = statementPeriodForBalance
		? getPreviousPeriodLastDate(statementPeriodForBalance)
		: null;
	const { payInvoice, paymentDate, paymentAccountId, removeTransactionIds } =
		parsed.data;

	const payerIdsByRow = rows.map((row) => row.payerId ?? payerId ?? null);
	const hasInvoicePayments = rows.some((row) => row.kind === "invoice_payment");
	const hasTransferRows = rows.some((row) => row.kind === "transfer");

	if (payerIdsByRow.some((id) => !id)) {
		return { success: false, error: "Pessoa obrigatória." };
	}

	if (hasInvoicePayments && !accountId) {
		return {
			success: false,
			error: "Pagamentos de fatura exigem uma conta corrente selecionada.",
		};
	}

	if (hasTransferRows && !accountId) {
		return {
			success: false,
			error: "Transferências exigem uma conta corrente selecionada.",
		};
	}

	const invoicePaymentCardIds = rows
		.filter((row) => row.kind === "invoice_payment")
		.map((row) => row.invoicePaymentCardId)
		.filter((id): id is string => Boolean(id));

	const transferPeerAccountIds = rows
		.filter((row) => row.kind === "transfer")
		.map((row) => row.transferPeerAccountId)
		.filter((id): id is string => Boolean(id));

	if (
		hasTransferRows &&
		transferPeerAccountIds.some((peerId) => peerId === accountId)
	) {
		return {
			success: false,
			error:
				"A outra conta da transferência deve ser diferente da conta do extrato.",
		};
	}

	// Valida ownership
	const [
		ownedPayerIds,
		ownedCategoryIds,
		accountOk,
		cardOk,
		invoiceCardsOk,
		transferPeersOk,
	] = await Promise.all([
		fetchOwnedPayerIds(userId, payerIdsByRow),
		fetchOwnedCategoryIds(
			userId,
			rows.map((row) => row.categoryId),
		),
		validateContaOwnership(userId, accountId),
		validateCartaoOwnership(userId, cardId),
		Promise.all(
			invoicePaymentCardIds.map((cardIdValue) =>
				validateCartaoOwnership(userId, cardIdValue),
			),
		).then((results) => results.every(Boolean)),
		Promise.all(
			transferPeerAccountIds.map((peerId) =>
				validateContaOwnership(userId, peerId),
			),
		).then((results) => results.every(Boolean)),
	]);

	if (payerIdsByRow.some((id) => id && !ownedPayerIds.has(id))) {
		return { success: false, error: "Pessoa não encontrada." };
	}

	if (
		rows.some((row) => row.categoryId && !ownedCategoryIds.has(row.categoryId))
	) {
		return { success: false, error: "Categoria não encontrada." };
	}

	if (!accountOk) return { success: false, error: "Conta não encontrada." };
	if (!cardOk) return { success: false, error: "Cartão não encontrado." };
	if (!invoiceCardsOk) {
		return { success: false, error: "Cartão da fatura não encontrado." };
	}
	if (!transferPeersOk) {
		return { success: false, error: "Conta da transferência não encontrada." };
	}

	const removeIds = [...new Set(removeTransactionIds ?? [])];
	if (removeIds.length > 0) {
		const ownedRemovals = await db.query.transactions.findMany({
			columns: { id: true },
			where: and(
				eq(transactions.userId, dataOwnerUserId),
				inArray(transactions.id, removeIds),
			),
		});

		if (ownedRemovals.length !== removeIds.length) {
			return {
				success: false,
				error:
					"Um ou mais lançamentos marcados para remoção não foram encontrados.",
			};
		}
	}

	const existingAmountEdits = dedupeExistingAmountEdits(
		parsed.data.existingAmountEdits ?? [],
	);

	let validatedAmountEdits: ValidatedAmountEdit[] = [];
	if (existingAmountEdits.length > 0) {
		const amountEditValidation = await validateExistingAmountEdits(
			db,
			dataOwnerUserId,
			existingAmountEdits,
		);
		if (!amountEditValidation.success) {
			return amountEditValidation;
		}
		validatedAmountEdits = amountEditValidation.edits;
	}

	const existingInstallmentEdits = dedupeExistingInstallmentEdits(
		parsed.data.existingInstallmentEdits ?? [],
	);

	/**
	 * Liquidação da fatura anterior, se a revisão apurou uma.
	 *
	 * Só vale para importação de fatura de cartão: é o arquivo desta fatura que
	 * revela quanto da anterior ficou pendente.
	 */
	const previousSettlement =
		cardId && invoicePeriod
			? (parsed.data.previousInvoiceSettlement ?? null)
			: null;

	/** Abates desta fatura declarados no arquivo, se houver. */
	const invoiceAmortizations =
		cardId && invoicePeriod ? (parsed.data.invoiceAmortizations ?? []) : [];

	let validatedInstallmentEdits: ExistingInstallmentEdit[] = [];
	if (existingInstallmentEdits.length > 0) {
		const installmentEditValidation = await validateExistingInstallmentEdits(
			db,
			dataOwnerUserId,
			existingInstallmentEdits,
		);
		if (!installmentEditValidation.success) {
			return installmentEditValidation;
		}
		validatedInstallmentEdits = installmentEditValidation.edits;
	}

	const hasInstallmentImports = rows.some(
		(row) => row.installmentImport?.enabled,
	);
	const hasRecurrenceImports = rows.some(
		(row) => row.recurrenceImport?.enabled,
	);
	if (hasInstallmentImports && !cardId) {
		return {
			success: false,
			error: "Parcelamentos só podem ser importados para cartão de crédito.",
		};
	}

	if (hasInstallmentImports && !invoicePeriod) {
		return {
			success: false,
			error: "Selecione a fatura para importar parcelamentos.",
		};
	}

	if (hasRecurrenceImports && !cardId && !accountId) {
		return {
			success: false,
			error: "Selecione uma conta ou cartão para importar recorrências.",
		};
	}

	if (payInvoice) {
		if (!cardId || !invoicePeriod) {
			return {
				success: false,
				error: "Selecione o cartão e a fatura para pagar.",
			};
		}

		if (!paymentAccountId) {
			return {
				success: false,
				error: "Selecione a conta de pagamento da fatura.",
			};
		}
	}

	if (rows.length === 0) {
		if (
			!payInvoice &&
			removeIds.length === 0 &&
			(existingAmountEdits.length > 0 || existingInstallmentEdits.length > 0)
		) {
			const importBatchId = parsed.data.importBatchId ?? randomUUID();

			if (parsed.data.importBatchId) {
				const existingUploadBatch = await db.query.importBatches.findFirst({
					columns: { id: true },
					where: and(
						eq(importBatches.userId, dataOwnerUserId),
						eq(importBatches.id, parsed.data.importBatchId),
					),
				});

				if (!existingUploadBatch) {
					return {
						success: false,
						error:
							"Registro de upload não encontrado. Envie o arquivo novamente.",
					};
				}
			}

			try {
				await db.transaction(async (tx) => {
					await applyExistingAmountCorrectionsT(
						tx,
						dataOwnerUserId,
						validatedAmountEdits,
					);
					await applyExistingInstallmentCorrectionsT(
						tx,
						dataOwnerUserId,
						validatedInstallmentEdits,
					);
				});
			} catch (error) {
				console.error("importTransactionsAction amount edits only", error);
				return {
					success: false,
					error: "Não foi possível aplicar as correções de valor.",
				};
			}

			const batchPayload = {
				sourceFileName: parsed.data.sourceFileName ?? "Importação sem arquivo",
				sourceFileSize: parsed.data.sourceFileSize ?? null,
				cardId: cardId ?? null,
				invoicePeriod: invoicePeriod ?? null,
				accountId: accountId ?? null,
				importedCount: 0,
				skippedCount: removeIds.length,
				status: IMPORT_BATCH_STATUS.IMPORTED,
				draftData: null,
			};

			const existingBatch = await db.query.importBatches.findFirst({
				columns: { id: true },
				where: and(
					eq(importBatches.userId, dataOwnerUserId),
					eq(importBatches.id, importBatchId),
				),
			});

			if (existingBatch) {
				await db
					.update(importBatches)
					.set(batchPayload)
					.where(eq(importBatches.id, importBatchId));
			} else {
				await db.insert(importBatches).values({
					id: importBatchId,
					userId: dataOwnerUserId,
					...batchPayload,
				});
			}

			await revalidateForEntity("transactions", userId);
			if (cardId) {
				await revalidateForEntity("cards", userId);
			}

			return {
				success: true,
				imported: 0,
				skipped: removeIds.length,
				importBatchId,
			};
		}

		if (!payInvoice && removeIds.length === 0) {
			if (!(accountId && !cardId && accountStatementBalances)) {
				return { success: true, imported: 0, skipped: 0, importBatchId: "" };
			}
		}

		if (!payInvoice && removeIds.length > 0) {
			const importBatchId = parsed.data.importBatchId ?? randomUUID();

			if (parsed.data.importBatchId) {
				const existingUploadBatch = await db.query.importBatches.findFirst({
					columns: { id: true },
					where: and(
						eq(importBatches.userId, dataOwnerUserId),
						eq(importBatches.id, parsed.data.importBatchId),
					),
				});

				if (!existingUploadBatch) {
					return {
						success: false,
						error:
							"Registro de upload não encontrado. Envie o arquivo novamente.",
					};
				}
			}

			try {
				await db.transaction(async (tx) => {
					await tx
						.delete(transactions)
						.where(
							and(
								eq(transactions.userId, dataOwnerUserId),
								inArray(transactions.id, removeIds),
							),
						);

					if (validatedAmountEdits.length > 0) {
						await applyExistingAmountCorrectionsT(
							tx,
							dataOwnerUserId,
							validatedAmountEdits,
						);
					}

					if (validatedInstallmentEdits.length > 0) {
						await applyExistingInstallmentCorrectionsT(
							tx,
							dataOwnerUserId,
							validatedInstallmentEdits,
						);
					}
				});
			} catch (error) {
				console.error("importTransactionsAction remove only", error);
				return {
					success: false,
					error: "Não foi possível remover os lançamentos selecionados.",
				};
			}

			await revalidateForEntity("transactions", userId);
			if (cardId) {
				await revalidateForEntity("cards", userId);
			}

			return {
				success: true,
				imported: 0,
				skipped: removeIds.length,
				importBatchId,
			};
		}

		if (!payInvoice) {
			if (accountId && !cardId && accountStatementBalances) {
				const importBatchId = parsed.data.importBatchId ?? randomUUID();

				if (parsed.data.importBatchId) {
					const existingUploadBatch = await db.query.importBatches.findFirst({
						columns: { id: true },
						where: and(
							eq(importBatches.userId, dataOwnerUserId),
							eq(importBatches.id, parsed.data.importBatchId),
						),
					});

					if (!existingUploadBatch) {
						return {
							success: false,
							error:
								"Registro de upload não encontrado. Envie o arquivo novamente.",
						};
					}
				}

				return finalizeAccountStatementBalanceImport({
					userId,
					dataOwnerUserId,
					accountId,
					balances: accountStatementBalances,
					importBatchId,
					sourceFileName: parsed.data.sourceFileName,
					sourceFileSize: parsed.data.sourceFileSize,
					importedRows: [],
				});
			}

			return { success: true, imported: 0, skipped: 0, importBatchId: "" };
		}

		if (!cardId || !invoicePeriod) {
			return {
				success: false,
				error: "Selecione o cartão e a fatura para pagar.",
			};
		}

		if (!paymentAccountId) {
			return {
				success: false,
				error: "Selecione a conta de pagamento da fatura.",
			};
		}

		const importBatchId = parsed.data.importBatchId ?? randomUUID();

		if (parsed.data.importBatchId) {
			const existingUploadBatch = await db.query.importBatches.findFirst({
				columns: { id: true },
				where: and(
					eq(importBatches.userId, dataOwnerUserId),
					eq(importBatches.id, parsed.data.importBatchId),
				),
			});

			if (!existingUploadBatch) {
				return {
					success: false,
					error:
						"Registro de upload não encontrado. Envie o arquivo novamente.",
				};
			}
		}

		if (removeIds.length > 0) {
			try {
				await db
					.delete(transactions)
					.where(
						and(
							eq(transactions.userId, dataOwnerUserId),
							inArray(transactions.id, removeIds),
						),
					);
			} catch (error) {
				console.error(
					"importTransactionsAction payInvoice remove extras",
					error,
				);
				return {
					success: false,
					error: "Não foi possível remover os lançamentos duplicados.",
				};
			}

			await revalidateForEntity("transactions", userId);
		}

		const payResult = await updateInvoicePaymentStatusAction({
			cardId,
			period: invoicePeriod,
			status: INVOICE_PAYMENT_STATUS.PAID,
			paymentDate,
			paymentAccountId: paymentAccountId ?? undefined,
		});

		if (!payResult.success) {
			return {
				success: false,
				error: payResult.error,
			};
		}

		await revalidateForEntity("cards", userId);

		const batchPayload = {
			sourceFileName: parsed.data.sourceFileName ?? "Importação sem arquivo",
			sourceFileSize: parsed.data.sourceFileSize ?? null,
			cardId,
			invoicePeriod,
			accountId: accountId ?? null,
			importedCount: 0,
			skippedCount: removeIds.length,
			status: IMPORT_BATCH_STATUS.IMPORTED,
			draftData: null,
		};

		const existingBatch = await db.query.importBatches.findFirst({
			columns: { id: true },
			where: and(
				eq(importBatches.userId, dataOwnerUserId),
				eq(importBatches.id, importBatchId),
			),
		});

		if (existingBatch) {
			await db
				.update(importBatches)
				.set(batchPayload)
				.where(eq(importBatches.id, importBatchId));
		} else {
			await db.insert(importBatches).values({
				id: importBatchId,
				userId: dataOwnerUserId,
				...batchPayload,
			});
		}

		return {
			success: true,
			imported: 0,
			skipped: removeIds.length,
			importBatchId,
		};
	}

	const importBatchId = parsed.data.importBatchId ?? randomUUID();

	if (parsed.data.importBatchId) {
		const existingUploadBatch = await db.query.importBatches.findFirst({
			columns: { id: true },
			where: and(
				eq(importBatches.userId, dataOwnerUserId),
				eq(importBatches.id, parsed.data.importBatchId),
			),
		});

		if (!existingUploadBatch) {
			return {
				success: false,
				error: "Registro de upload não encontrado. Envie o arquivo novamente.",
			};
		}
	}
	const isSettled = paymentMethod !== "Cartão de crédito";

	const pagamentosCategory = await db.query.categories.findFirst({
		columns: { id: true },
		where: and(
			eq(categories.userId, dataOwnerUserId),
			eq(categories.name, INVOICE_PAYMENT_CATEGORY_NAME),
		),
	});

	const transferCategory = hasTransferRows
		? await db.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, dataOwnerUserId),
					eq(categories.name, TRANSFER_CATEGORY_NAME),
				),
			})
		: null;

	if (hasTransferRows && !transferCategory) {
		return {
			success: false,
			error: `Categoria "${TRANSFER_CATEGORY_NAME}" não encontrada.`,
		};
	}

	const transferAccountIds = hasTransferRows
		? Array.from(
				new Set(
					[accountId, ...transferPeerAccountIds].filter((id): id is string =>
						Boolean(id),
					),
				),
			)
		: [];

	const transferAccounts = hasTransferRows
		? await db.query.financialAccounts.findMany({
				columns: { id: true, name: true },
				where: and(
					eq(financialAccounts.userId, dataOwnerUserId),
					inArray(financialAccounts.id, transferAccountIds),
				),
			})
		: [];

	const transferAccountsById = new Map(
		transferAccounts.map((account) => [account.id, account.name]),
	);

	const invoiceCards = hasInvoicePayments
		? await db.query.cards.findMany({
				columns: { id: true, name: true },
				where: and(
					eq(cards.userId, dataOwnerUserId),
					inArray(cards.id, invoicePaymentCardIds),
				),
			})
		: [];

	const invoiceCardsById = new Map(
		invoiceCards.map((card) => [card.id, card.name]),
	);

	const importPaymentMethod =
		paymentMethod === "Cartão de crédito"
			? ("Cartão de crédito" as const)
			: ("Pix" as const);

	/**
	 * Ocorrências de série já gravadas neste cartão.
	 *
	 * Importar a parcela N/M expande a série e grava as anteriores nas faturas
	 * passadas. Sem esta checagem, reprocessar uma fatura recriava as parcelas
	 * anteriores por cima das que já existiam — duplicata silenciosa e cumulativa
	 * numa fatura já fechada, uma cópia por reprocessamento.
	 */
	const hasInstallmentExpansion = rows.some(
		(row) => row.kind === "transaction" && row.installmentImport?.enabled,
	);
	const existingInstallmentKeys = new Set<string>();
	/**
	 * Série já gravada, por identidade da compra.
	 *
	 * A parcela que faltava tem que entrar na série das irmãs. Cunhar um
	 * `seriesId` novo deixava a linha solta e a tela mostrava cada parcela como
	 * uma compra separada.
	 */
	const existingSeriesIdByKey = new Map<string, string>();
	/**
	 * Data de compra mais antiga já gravada para cada série.
	 *
	 * A série compartilha uma data só. A parcela nova chega com a data da linha
	 * do arquivo, que pode ser do ciclo; a mais antiga entre as duas é a compra
	 * de verdade, porque a compra nunca acontece depois do ciclo que a cobra.
	 */
	const existingSeriesPurchaseDateByKey = new Map<string, string>();

	if (hasInstallmentExpansion && cardId) {
		const existingOccurrences = await db
			.select({
				name: transactions.name,
				period: transactions.period,
				currentInstallment: transactions.currentInstallment,
				installmentCount: transactions.installmentCount,
				seriesId: transactions.seriesId,
				purchaseDate: transactions.purchaseDate,
			})
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.cardId, cardId),
					isNotNull(transactions.installmentCount),
				),
			);

		for (const occurrence of existingOccurrences) {
			existingInstallmentKeys.add(
				buildInstallmentOccurrenceKey({
					name: occurrence.name,
					period: occurrence.period,
					currentInstallment: occurrence.currentInstallment,
					installmentCount: occurrence.installmentCount,
				}),
			);

			if (!occurrence.seriesId || occurrence.currentInstallment == null) {
				continue;
			}

			const seriesKey = buildInstallmentSeriesKey({
				name: occurrence.name,
				installmentCount: occurrence.installmentCount,
				firstPeriod: getInstallmentBasePeriod(
					occurrence.period,
					occurrence.currentInstallment,
				),
			});

			if (!existingSeriesIdByKey.has(seriesKey)) {
				existingSeriesIdByKey.set(seriesKey, occurrence.seriesId);
			}

			// A ponte devolve data como string, não Date — `toDateOnlyString`
			// aceita as duas formas.
			const storedPurchaseDate = toDateOnlyString(occurrence.purchaseDate);
			if (storedPurchaseDate) {
				const known = existingSeriesPurchaseDateByKey.get(seriesKey);
				if (!known || storedPurchaseDate < known) {
					existingSeriesPurchaseDateByKey.set(seriesKey, storedPurchaseDate);
				}
			}
		}
	}

	const regularRecords: TransactionInsert[] = rows.flatMap((row, rowIndex) => {
		if (row.kind !== "transaction") return [];

		const payerIdValue = payerIdsByRow[rowIndex];
		if (!payerIdValue) return [];

		const purchaseDate = parseLocalDateString(row.date);

		if (row.installmentImport?.enabled && cardId && invoicePeriod) {
			const installment = row.installmentImport;
			const firstPeriod = getInstallmentBasePeriod(
				invoicePeriod,
				installment.currentInstallment,
			);
			const seriesKey = buildInstallmentSeriesKey({
				name: installment.name,
				installmentCount: installment.installmentCount,
				firstPeriod,
			});
			// O Nubank carimba a data do ciclo em cada parcela; outros cartões
			// repetem a data da compra. Sem normalizar, a série toda herdava uma
			// data posterior à própria fatura em que aparece.
			const resolvedPurchaseDate = resolveInstallmentPurchaseDate({
				chargeDate: row.date,
				invoicePeriod,
				currentInstallment: installment.currentInstallment,
			});
			// A série tem uma data só, e entre as candidatas vale a mais antiga.
			const knownPurchaseDate = existingSeriesPurchaseDateByKey.get(seriesKey);
			const seriesPurchaseDate =
				knownPurchaseDate && knownPurchaseDate < resolvedPurchaseDate
					? knownPurchaseDate
					: resolvedPurchaseDate;
			const totalAmount = row.amount * installment.installmentCount;
			// Reaproveita a série já gravada desta compra; só cunha id novo
			// quando a série ainda não existe.
			const seriesId = existingSeriesIdByKey.get(seriesKey) ?? randomUUID();
			const amountSign: 1 | -1 = row.transactionType === "expense" ? -1 : 1;

			return buildTransactionRecords({
				data: {
					purchaseDate: seriesPurchaseDate,
					period: firstPeriod,
					name: installment.name,
					transactionType:
						row.transactionType === "income" ? "Receita" : "Despesa",
					amount: totalAmount,
					condition: "Parcelado",
					paymentMethod: importPaymentMethod,
					payerId: payerIdValue,
					isSplit: false,
					accountId: accountId ?? null,
					cardId,
					categoryId: row.categoryId ?? null,
					note: null,
					installmentCount: installment.installmentCount,
					startInstallment: 1,
					isSettled: null,
				},
				userId: dataOwnerUserId,
				period: firstPeriod,
				purchaseDate: parseLocalDateString(seriesPurchaseDate),
				dueDate: null,
				boletoPaymentDate: null,
				shares: [
					{
						payerId: payerIdValue,
						amountCents: Math.round(totalAmount * 100),
					},
				],
				amountSign,
				shouldNullifySettled: true,
				seriesId,
			})
				.filter(
					(record) =>
						!existingInstallmentKeys.has(
							buildInstallmentOccurrenceKey({
								name: record.name ?? installment.name,
								period: record.period ?? firstPeriod,
								currentInstallment: record.currentInstallment ?? null,
								installmentCount: record.installmentCount ?? null,
							}),
						),
				)
				.map((record) => ({
					...record,
					isSettled: record.isSettled ?? false,
					ofxFitId:
						record.currentInstallment === installment.currentInstallment
							? row.externalId
							: null,
					importBatchId,
				}));
		}

		if (row.recurrenceImport?.enabled) {
			const recurrence = row.recurrenceImport;
			const period = resolveImportRowPeriod({
				date: purchaseDate,
				invoicePeriod,
				isCardImport: Boolean(cardId),
			});
			const seriesId = randomUUID();
			const amountSign: 1 | -1 = row.transactionType === "expense" ? -1 : 1;

			return buildTransactionRecords({
				data: {
					purchaseDate: row.date,
					period,
					name: row.description,
					transactionType:
						row.transactionType === "income" ? "Receita" : "Despesa",
					amount: row.amount,
					condition: "Recorrente",
					paymentMethod: importPaymentMethod,
					payerId: payerIdValue,
					isSplit: false,
					accountId: accountId ?? null,
					cardId: cardId ?? null,
					categoryId: row.categoryId ?? null,
					note: null,
					recurrenceCount: recurrence.recurrenceCount,
					isSettled: null,
				},
				userId: dataOwnerUserId,
				period,
				purchaseDate,
				dueDate: null,
				boletoPaymentDate: null,
				shares: [
					{
						payerId: payerIdValue,
						amountCents: Math.round(row.amount * 100),
					},
				],
				amountSign,
				shouldNullifySettled: true,
				seriesId,
			}).map((record, recordIndex) => ({
				...record,
				isSettled: record.isSettled ?? false,
				ofxFitId: recordIndex === 0 ? row.externalId : null,
				importBatchId,
			}));
		}

		let period = resolveImportRowPeriod({
			date: purchaseDate,
			invoicePeriod,
			isCardImport: Boolean(cardId),
		});
		let resolvedPurchaseDate = purchaseDate;

		if (
			accountId &&
			!cardId &&
			statementPeriodForBalance &&
			previousPeriodLastDate &&
			shouldRelocateBalanceAdjustmentRow(
				row.date,
				row.description,
				statementPeriodForBalance,
			)
		) {
			resolvedPurchaseDate = parseLocalDateString(previousPeriodLastDate);
			period = addMonthsToPeriod(statementPeriodForBalance, -1);
		}

		return [
			{
				name: row.description,
				transactionType:
					row.transactionType === "income" ? "Receita" : "Despesa",
				condition: "À vista",
				paymentMethod: importPaymentMethod,
				amount: (row.transactionType === "expense"
					? -row.amount
					: row.amount
				).toFixed(2),
				purchaseDate: resolvedPurchaseDate,
				period,
				isSettled,
				userId: dataOwnerUserId,
				payerId: payerIdValue,
				accountId: accountId ?? null,
				cardId: cardId ?? null,
				categoryId: row.categoryId ?? null,
				installmentCount: null,
				currentInstallment: null,
				seriesId: null,
				ofxFitId: row.externalId,
				importBatchId,
			},
		];
	});

	const transferRecords: TransactionInsert[] = rows.flatMap((row, rowIndex) => {
		if (row.kind !== "transfer") return [];

		const peerAccountId = row.transferPeerAccountId;
		if (!peerAccountId || !accountId) {
			throw new Error("Transferência incompleta.");
		}

		const fromAccountId =
			row.transactionType === "expense" ? accountId : peerAccountId;
		const toAccountId =
			row.transactionType === "expense" ? peerAccountId : accountId;
		const fromAccountName =
			transferAccountsById.get(fromAccountId) ?? "Conta origem";
		const toAccountName =
			transferAccountsById.get(toAccountId) ?? "Conta destino";
		const transferId = randomUUID();
		const purchaseDate = parseLocalDateString(row.date);
		const period = resolveImportRowPeriod({
			date: purchaseDate,
			invoicePeriod,
			isCardImport: Boolean(cardId),
		});
		const transferNote = `de ${fromAccountName} -> ${toAccountName}`;
		const payerIdValue = payerIdsByRow[rowIndex];
		if (!payerIdValue) return [];

		const importAccountIsSource = row.transactionType === "expense";

		return [
			{
				name: TRANSFER_ESTABLISHMENT_SAIDA,
				transactionType: "Transferência" as const,
				condition: TRANSFER_CONDITION,
				paymentMethod: TRANSFER_PAYMENT_METHOD,
				note: transferNote,
				amount: formatDecimalForDbRequired(-Math.abs(row.amount)),
				purchaseDate,
				period,
				isSettled: true,
				userId: dataOwnerUserId,
				payerId: payerIdValue,
				accountId: fromAccountId,
				cardId: null,
				categoryId: transferCategory?.id ?? null,
				installmentCount: null,
				currentInstallment: null,
				seriesId: null,
				transferId,
				ofxFitId: importAccountIsSource ? row.externalId : null,
				importBatchId,
			},
			{
				name: TRANSFER_ESTABLISHMENT_ENTRADA,
				transactionType: "Transferência" as const,
				condition: TRANSFER_CONDITION,
				paymentMethod: TRANSFER_PAYMENT_METHOD,
				note: transferNote,
				amount: formatDecimalForDbRequired(Math.abs(row.amount)),
				purchaseDate,
				period,
				isSettled: true,
				userId: dataOwnerUserId,
				payerId: payerIdValue,
				accountId: toAccountId,
				cardId: null,
				categoryId: transferCategory?.id ?? null,
				installmentCount: null,
				currentInstallment: null,
				seriesId: null,
				transferId,
				ofxFitId: importAccountIsSource ? null : row.externalId,
				importBatchId,
			},
		];
	});

	const invoicePaymentRecords = rows.flatMap((row, rowIndex) => {
		if (row.kind !== "invoice_payment") return [];

		const cardIdValue = row.invoicePaymentCardId;
		const period = row.invoicePaymentPeriod;
		if (!cardIdValue || !period) {
			throw new Error("Pagamento de fatura incompleto.");
		}

		const cardName = invoiceCardsById.get(cardIdValue) ?? "Cartão";
		const purchaseDate = parseLocalDateString(row.date);
		const invoiceNote = buildInvoicePaymentNote(cardIdValue, period);

		return [
			{
				name: `Pagamento fatura - ${cardName}`,
				transactionType: "Despesa" as const,
				condition: "À vista" as const,
				paymentMethod: "Pix",
				note: invoiceNote,
				amount: `-${formatDecimalForDbRequired(row.amount)}`,
				purchaseDate,
				period,
				isSettled: true,
				userId: dataOwnerUserId,
				payerId: payerIdsByRow[rowIndex],
				accountId,
				cardId: null,
				categoryId: pagamentosCategory?.id ?? row.categoryId ?? null,
				ofxFitId: row.externalId,
				importBatchId,
				settleCardId: cardIdValue,
				settlePeriod: period,
			},
		];
	});

	let inserted: { id: string }[] = [];

	try {
		const allRecords = [
			...regularRecords,
			...transferRecords,
			...invoicePaymentRecords.map(
				({ settleCardId, settlePeriod, ...record }) => record,
			),
		];

		const fitIdsInBatch = [
			...new Set(
				allRecords
					.map((record) => record.ofxFitId)
					.filter((fitId): fitId is string => Boolean(fitId)),
			),
		];

		const storedOccurrences: ImportOccurrenceIdentity[] = [];
		const storedFitIds = new Set<string>();
		if (fitIdsInBatch.length > 0) {
			const duplicateRows = await db
				.select({
					ofxFitId: transactions.ofxFitId,
					installmentCount: transactions.installmentCount,
					currentInstallment: transactions.currentInstallment,
				})
				.from(transactions)
				.where(
					and(
						eq(transactions.userId, dataOwnerUserId),
						inArray(transactions.ofxFitId, fitIdsInBatch),
					),
				);

			for (const row of duplicateRows) {
				if (!row.ofxFitId) continue;
				storedFitIds.add(row.ofxFitId);
				storedOccurrences.push({
					externalId: row.ofxFitId,
					installmentCount: row.installmentCount,
					currentInstallment: row.currentInstallment,
				});
			}
		}

		const seenOccurrencesInBatch: ImportOccurrenceIdentity[] = [];
		const seenFitIdsInBatch = new Set<string>();
		const recordsToInsert = allRecords.flatMap((record) => {
			if (!record.ofxFitId) return [record];

			// Pagamento de fatura e transferência não têm campos de parcela.
			const identity: ImportOccurrenceIdentity = {
				externalId: record.ofxFitId,
				installmentCount:
					"installmentCount" in record
						? (record.installmentCount ?? null)
						: null,
				currentInstallment:
					"currentInstallment" in record
						? (record.currentInstallment ?? null)
						: null,
			};

			// Contra o banco vale a base do id: reimportar o mesmo arquivo com a
			// numeração do sufixo trocada não deve duplicar.
			const plan = planImportRecordInsertion(identity, {
				storedOccurrences,
				storedExternalIds: storedFitIds,
			});

			if (plan === "skip") return [];

			// Dentro do lote o id é comparado inteiro: o sufixo "#2" existe
			// porque as duas linhas são idênticas e são duas cobranças reais —
			// dois pedágios no mesmo dia pelo mesmo valor, por exemplo.
			if (
				importOccurrenceCollidesWithStored(identity, seenOccurrencesInBatch, {
					sameFile: true,
				})
			) {
				return [];
			}

			seenOccurrencesInBatch.push(identity);

			// O id já tem dono: no banco, ou numa linha anterior deste mesmo
			// lote. A cobrança é distinta e precisa existir, então entra sem o
			// id — o índice único admite um só dono por (usuário, id).
			if (
				plan === "insert_without_external_id" ||
				seenFitIdsInBatch.has(record.ofxFitId)
			) {
				return [{ ...record, ofxFitId: null }];
			}

			seenFitIdsInBatch.add(record.ofxFitId);
			return [record];
		});

		// Uma chamada, uma transação. `db.transaction()` do bridge não abre
		// transação nenhuma — é a API do Supabase, HTTP stateless — então as seis
		// escritas ficavam soltas e uma falha no meio deixava metade aplicada.
		// A decisão de o que apagar, corrigir e inserir continua toda aqui em
		// TypeScript; a RPC apenas aplica o resultado de forma atômica.
		const insertedRows = await callRpc<{ inserted_id: string }>(
			"apply_invoice_import",
			{
				p_user_id: dataOwnerUserId,
				p_delete_ids: removeIds,
				p_amount_edits: validatedAmountEdits.map((edit) => ({
					id: edit.transactionId,
					valor: formatDecimalForDbRequired(
						amountEditToSignedStored(edit.amount, edit.transactionType),
					),
				})),
				p_installment_edits: validatedInstallmentEdits.map((edit) => ({
					id: edit.transactionId,
					parcela_atual: edit.currentInstallment,
					qtde_parcela: edit.installmentCount,
				})),
				p_rows: recordsToInsert.map((record) =>
					toDbColumnNames(transactions, record as Record<string, unknown>),
				),
				p_invoice_payments: invoicePaymentRecords.map((record) => ({
					cartao_id: record.settleCardId,
					periodo: record.settlePeriod,
					status_pagamento: INVOICE_PAYMENT_STATUS.PAID,
				})),
				p_previous_settlement: previousSettlement
					? {
							cartao_id: cardId,
							periodo: previousSettlement.period,
							status_pagamento: resolveSettlementStatus(previousSettlement),
							valor_pago:
								resolveSettlementStatus(previousSettlement) ===
								INVOICE_PAYMENT_STATUS.PARTIAL
									? formatDecimalForDbRequired(previousSettlement.paidAmount)
									: null,
							lancamento_id: previousSettlement.paymentTransactionId ?? null,
							data_lancamento: previousSettlement.paymentDate ?? null,
							// O débito na conta é saída de dinheiro: sinal negativo.
							valor_lancamento: formatDecimalForDbRequired(
								-Math.abs(previousSettlement.paidAmount),
							),
						}
					: null,
			},
		);

		inserted = insertedRows.map((row: { inserted_id: string }) => ({
			id: row.inserted_id,
		}));
	} catch (error) {
		console.error("importTransactionsAction", error);
		if (isPostgresUniqueViolation(error)) {
			return {
				success: false,
				error:
					"Há lançamentos duplicados no arquivo (mesmo identificador do extrato). Revise os itens marcados como duplicata e tente novamente.",
			};
		}
		return {
			success: false,
			error: "Não foi possível concluir a importação. Tente novamente.",
		};
	}

	await revalidateForEntity("transactions", userId);
	if (accountId && !cardId && accountStatementBalances) {
		const reconciliation = await applyAccountStatementBalanceReconciliation({
			viewerUserId: userId,
			dataOwnerUserId,
			accountId,
			balances: accountStatementBalances,
			importedRows: rows
				.filter((row) => row.kind === "transaction")
				.map((row) => ({
					date: row.date,
					description: row.description,
					amount: row.amount,
					transactionType: row.transactionType,
				})),
		});

		if (!reconciliation.success) {
			return reconciliation;
		}

		await revalidateForEntity("accounts", userId);
	}
	if (
		hasInvoicePayments ||
		payInvoice ||
		(cardId && validatedAmountEdits.length > 0)
	) {
		await revalidateForEntity("cards", userId);
	}
	if (hasTransferRows) {
		await revalidateForEntity("accounts", userId);
	}

	/*
	 * Antes da baixa, de propósito: a baixa desconta o que já está registrado
	 * para gravar só o que falta pagar. Na ordem inversa, os dois débitos
	 * somariam mais do que saiu da conta.
	 */
	if (cardId && invoicePeriod && invoiceAmortizations.length > 0) {
		const amortizationResult = await registerInvoiceAmortizationsAction({
			cardId,
			period: invoicePeriod,
			accountId: paymentAccountId ?? null,
			payments: invoiceAmortizations,
		});

		if (!amortizationResult.success) {
			return {
				success: false,
				error:
					amortizationResult.error ||
					"Lançamentos importados, mas não foi possível registrar o pagamento antecipado da fatura.",
			};
		}
	}

	if (payInvoice && cardId && invoicePeriod) {
		try {
			const payResult = await updateInvoicePaymentStatusAction({
				cardId,
				period: invoicePeriod,
				status: INVOICE_PAYMENT_STATUS.PAID,
				paymentDate,
				paymentAccountId: paymentAccountId ?? undefined,
			});

			if (!payResult.success) {
				return {
					success: false,
					error:
						payResult.error ||
						"Lançamentos importados, mas não foi possível marcar a fatura como paga.",
				};
			}
		} catch (error) {
			console.error("importTransactionsAction:payInvoice", error);
			return {
				success: false,
				error:
					"Lançamentos importados, mas não foi possível marcar a fatura como paga. Tente pagar a fatura manualmente.",
			};
		}
	}

	const skippedCount =
		regularRecords.length +
		transferRecords.length +
		invoicePaymentRecords.length -
		inserted.length;

	const batchPayload = {
		sourceFileName: parsed.data.sourceFileName ?? "Importação sem arquivo",
		sourceFileSize: parsed.data.sourceFileSize ?? null,
		cardId: cardId ?? null,
		invoicePeriod: invoicePeriod ?? null,
		accountId: accountId ?? null,
		importedCount: inserted.length,
		skippedCount,
		status: IMPORT_BATCH_STATUS.IMPORTED,
		draftData: null,
	};

	const existingBatch = await db.query.importBatches.findFirst({
		columns: { id: true },
		where: and(
			eq(importBatches.userId, dataOwnerUserId),
			eq(importBatches.id, importBatchId),
		),
	});

	if (existingBatch) {
		await db
			.update(importBatches)
			.set({
				...batchPayload,
				sourceInvoiceTotalOverride:
					parsed.data.sourceInvoiceTotalOverride ?? false,
			})
			.where(eq(importBatches.id, importBatchId));
	} else {
		await db.insert(importBatches).values({
			id: importBatchId,
			userId: dataOwnerUserId,
			...batchPayload,
			sourceInvoiceTotalOverride:
				parsed.data.sourceInvoiceTotalOverride ?? false,
		});
	}

	return {
		success: true,
		imported: inserted.length,
		skipped: skippedCount,
		importBatchId,
	};
}

export async function deleteTransactionByFitId(
	fitId: string,
): Promise<{ success: boolean; error?: string }> {
	if (!fitId) return { success: false, error: "FITID inválido." };

	const userId = await getUserId();
	const { dataOwnerUserId } = await assertFinancialEditAccess(userId);

	await db
		.delete(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.ofxFitId, fitId),
			),
		);

	await revalidateForEntity("transactions", userId);

	return { success: true };
}

export async function undoImportAction(
	importBatchId: string,
): Promise<{ success: boolean; error?: string }> {
	if (!importBatchId) return { success: false, error: "Batch inválido." };

	const userId = await getUserId();
	const { dataOwnerUserId } = await assertFinancialEditAccess(userId);

	const batch = await db.query.importBatches.findFirst({
		columns: {
			id: true,
			attachmentId: true,
		},
		where: and(
			eq(importBatches.userId, dataOwnerUserId),
			eq(importBatches.id, importBatchId),
		),
		with: {
			attachment: {
				columns: {
					id: true,
					fileKey: true,
				},
			},
		},
	});

	await db
		.delete(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.importBatchId, importBatchId),
			),
		);

	if (batch?.attachment?.fileKey) {
		await deleteS3Object(batch.attachment.fileKey).catch(() => {});
	}

	if (batch?.attachmentId) {
		await db.delete(attachments).where(eq(attachments.id, batch.attachmentId));
	}

	if (batch) {
		await db.delete(importBatches).where(eq(importBatches.id, importBatchId));
	}

	await revalidateForEntity("transactions", userId);

	return { success: true };
}
