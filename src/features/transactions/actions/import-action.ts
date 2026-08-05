"use server";

import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
	cards,
	categories,
	importBatches,
	invoices,
	transactions,
	attachments,
} from "@/db/schema";
import {
	buildTransactionRecords,
	fetchOwnedCategoryIds,
	fetchOwnedPayerIds,
	type TransactionInsert,
	validateCartaoOwnership,
	validateContaOwnership,
} from "@/features/transactions/actions/core";
import { getInstallmentBasePeriod } from "@/features/transactions/lib/import-installments";
import { updateInvoicePaymentStatusAction } from "@/features/invoices/actions";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { buildInvoicePaymentNote } from "@/shared/lib/accounts/constants";
import { getUserId } from "@/shared/lib/auth/server";
import { INVOICE_PAYMENT_CATEGORY_NAME } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import { deleteS3Object } from "@/shared/lib/storage/presign";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { IMPORT_BATCH_STATUS } from "@/features/transactions/lib/import-batch-status";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString } from "@/shared/utils/date";

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
		categoryId: uuidSchema("Category").nullable().optional(),
		payerId: uuidSchema("Payer").nullable().optional(),
		kind: z.enum(["transaction", "invoice_payment"]).default("transaction"),
		invoicePaymentCardId: uuidSchema("Cartão").nullable().optional(),
		invoicePaymentPeriod: z
			.string()
			.regex(/^\d{4}-\d{2}$/, "Período inválido.")
			.nullable()
			.optional(),
		installmentImport: installmentImportSchema.nullable().optional(),
		recurrenceImport: recurrenceImportSchema.nullable().optional(),
	})
	.superRefine((row, ctx) => {
		if (row.kind !== "invoice_payment") return;

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
	});

const importSchema = z.object({
	rows: z.array(importRowSchema).min(1, "Selecione ao menos uma transação."),
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
});

type ImportInput = z.infer<typeof importSchema>;

type ImportResult =
	| { success: true; imported: number; skipped: number; importBatchId: string }
	| { success: false; error: string };

// Retorna os externalIds que já existem para o usuário (para marcar duplicatas)
export async function checkDuplicateFitIds(
	fitIds: string[],
): Promise<string[]> {
	const userId = await getUserId();
	const ids = fitIds.filter(Boolean);
	if (ids.length === 0) return [];

	const rows = await db
		.select({ ofxFitId: transactions.ofxFitId })
		.from(transactions)
		.where(
			and(eq(transactions.userId, userId), inArray(transactions.ofxFitId, ids)),
		);

	return rows.map((r) => r.ofxFitId).filter((id): id is string => id !== null);
}

export async function fetchImportDuplicateSnapshots(fitIds: string[]) {
	const userId = await getUserId();
	const ids = fitIds.filter(Boolean);
	if (ids.length === 0) return [];

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
		})
		.from(transactions)
		.where(
			and(eq(transactions.userId, userId), inArray(transactions.ofxFitId, ids)),
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
			})),
		);
}

export async function fetchInvoicePeriodDuplicateSnapshots(
	cardId: string,
	invoicePeriod: string,
) {
	const userId = await getUserId();

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
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.cardId, cardId),
				eq(transactions.period, invoicePeriod),
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
			})),
		);
}

export async function deleteImportDuplicateTransaction(
	transactionId: string,
): Promise<{ success: boolean; error?: string }> {
	if (!transactionId) return { success: false, error: "Lançamento inválido." };

	const userId = await getUserId();

	const deleted = await db
		.delete(transactions)
		.where(
			and(eq(transactions.userId, userId), eq(transactions.id, transactionId)),
		)
		.returning({ id: transactions.id });

	if (deleted.length === 0) {
		return { success: false, error: "Lançamento não encontrado." };
	}

	await revalidateForEntity("transactions", userId);

	return { success: true };
}

export async function importTransactionsAction(
	input: ImportInput,
): Promise<ImportResult> {
	const userId = await getUserId();
	const parsed = importSchema.safeParse(input);

	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
		};
	}

	const { rows, payerId, accountId, cardId, paymentMethod, invoicePeriod } =
		parsed.data;
	const { payInvoice, paymentDate, paymentAccountId } = parsed.data;

	const payerIdsByRow = rows.map((row) => row.payerId ?? payerId ?? null);
	const hasInvoicePayments = rows.some((row) => row.kind === "invoice_payment");

	if (payerIdsByRow.some((id) => !id)) {
		return { success: false, error: "Pessoa obrigatória." };
	}

	if (hasInvoicePayments && !accountId) {
		return {
			success: false,
			error: "Pagamentos de fatura exigem uma conta corrente selecionada.",
		};
	}

	const invoicePaymentCardIds = rows
		.filter((row) => row.kind === "invoice_payment")
		.map((row) => row.invoicePaymentCardId)
		.filter((id): id is string => Boolean(id));

	// Valida ownership
	const [ownedPayerIds, ownedCategoryIds, accountOk, cardOk, invoiceCardsOk] =
		await Promise.all([
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

	const hasInstallmentImports = rows.some((row) => row.installmentImport?.enabled);
	const hasRecurrenceImports = rows.some((row) => row.recurrenceImport?.enabled);
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
		return { success: true, imported: 0, skipped: 0, importBatchId: "" };
	}

	let importBatchId = parsed.data.importBatchId ?? randomUUID();

	if (parsed.data.importBatchId) {
		const existingUploadBatch = await db.query.importBatches.findFirst({
			columns: { id: true },
			where: and(
				eq(importBatches.userId, userId),
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
			eq(categories.userId, userId),
			eq(categories.name, INVOICE_PAYMENT_CATEGORY_NAME),
		),
	});

	const invoiceCards = hasInvoicePayments
		? await db.query.cards.findMany({
				columns: { id: true, name: true },
				where: and(
					eq(cards.userId, userId),
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
			const totalAmount = row.amount * installment.installmentCount;
			const seriesId = randomUUID();
			const amountSign: 1 | -1 = row.transactionType === "expense" ? -1 : 1;

			return buildTransactionRecords({
				data: {
					purchaseDate: row.date,
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
				userId,
				period: firstPeriod,
				purchaseDate,
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
			}).map((record) => ({
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
			const period =
				invoicePeriod ??
				`${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, "0")}`;
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
				userId,
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

		const period =
			invoicePeriod ??
			`${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, "0")}`;

		return [
			{
				name: row.description,
				transactionType: row.transactionType === "income" ? "Receita" : "Despesa",
				condition: "À vista",
				paymentMethod: importPaymentMethod,
				amount: (row.transactionType === "expense"
					? -row.amount
					: row.amount
				).toFixed(2),
				purchaseDate,
				period,
				isSettled,
				userId,
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
				userId,
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

	const inserted = await db.transaction(async (tx) => {
		const allRecords = [
			...regularRecords,
			...invoicePaymentRecords.map(
				({ settleCardId, settlePeriod, ...record }) => record,
			),
		];

		const insertedRows =
			allRecords.length > 0
				? await tx
						.insert(transactions)
						.values(allRecords)
						.onConflictDoNothing()
						.returning({ id: transactions.id })
				: [];

		for (const record of invoicePaymentRecords) {
			await tx
				.insert(invoices)
				.values({
					cardId: record.settleCardId,
					period: record.settlePeriod,
					paymentStatus: INVOICE_PAYMENT_STATUS.PAID,
					userId,
				})
				.onConflictDoUpdate({
					target: [invoices.userId, invoices.cardId, invoices.period],
					set: {
						paymentStatus: INVOICE_PAYMENT_STATUS.PAID,
					},
				});

			await tx
				.update(transactions)
				.set({ isSettled: true })
				.where(
					and(
						eq(transactions.userId, userId),
						eq(transactions.cardId, record.settleCardId),
						eq(transactions.period, record.settlePeriod),
					),
				);
		}

		return insertedRows;
	});

	await revalidateForEntity("transactions", userId);
	if (hasInvoicePayments || payInvoice) {
		await revalidateForEntity("cards", userId);
	}

	if (payInvoice && cardId && invoicePeriod) {
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
	}

	const skippedCount =
		regularRecords.length + invoicePaymentRecords.length - inserted.length;

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
			eq(importBatches.userId, userId),
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
			userId,
			...batchPayload,
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

	await db
		.delete(transactions)
		.where(
			and(eq(transactions.userId, userId), eq(transactions.ofxFitId, fitId)),
		);

	await revalidateForEntity("transactions", userId);

	return { success: true };
}

export async function undoImportAction(
	importBatchId: string,
): Promise<{ success: boolean; error?: string }> {
	if (!importBatchId) return { success: false, error: "Batch inválido." };

	const userId = await getUserId();

	const batch = await db.query.importBatches.findFirst({
		columns: {
			id: true,
			attachmentId: true,
		},
		where: and(
			eq(importBatches.userId, userId),
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
				eq(transactions.userId, userId),
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
