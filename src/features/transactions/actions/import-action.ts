"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte, ilike, inArray, isNotNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
	attachments,
	cards,
	categories,
	financialAccounts,
	importBatches,
	transactions,
} from "@/db/schema";
import { updateInvoicePaymentStatusAction } from "@/features/invoices/actions";
import { upsertInvoicePaymentStatus } from "@/features/invoices/lib/upsert-invoice-payment";
import {
	buildTransactionRecords,
	fetchOwnedCategoryIds,
	fetchOwnedPayerIds,
	type TransactionInsert,
	validateCartaoOwnership,
	validateContaOwnership,
} from "@/features/transactions/actions/core";
import { IMPORT_BATCH_STATUS } from "@/features/transactions/lib/import-batch-status";
import { getInstallmentBasePeriod } from "@/features/transactions/lib/import-installments";
import { buildInvoicePaymentNote } from "@/shared/lib/accounts/constants";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { INVOICE_PAYMENT_CATEGORY_NAME } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { deleteS3Object } from "@/shared/lib/storage/presign";
import {
	TRANSFER_CATEGORY_NAME,
	TRANSFER_CONDITION,
	TRANSFER_ESTABLISHMENT_ENTRADA,
	TRANSFER_ESTABLISHMENT_SAIDA,
	TRANSFER_PAYMENT_METHOD,
} from "@/shared/lib/transfers/constants";
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
	})
	.superRefine((data, ctx) => {
		if (data.rows.length === 0 && !data.payInvoice) {
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

const mapImportDuplicateSnapshotRows = (
	rows: Array<{
		id: string;
		ofxFitId: string | null;
		name: string;
		amount: string;
		purchaseDate: Date;
		transactionType: string;
		currentInstallment: number | null;
		installmentCount: number | null;
		payerId: string | null;
		categoryId: string | null;
	}>,
) =>
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
	}));

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
		.then(mapImportDuplicateSnapshotRows);
}

/** Parcelas ficam em outros períodos; inclui série parcelada e linhas à vista com "parcela" no nome. */
export async function fetchCardInstallmentDuplicateSnapshots(cardId: string) {
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
	const fromDate = parseLocalDateString(dateFrom);
	const toDate = parseLocalDateString(dateTo);

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
				eq(transactions.accountId, accountId),
				gte(transactions.purchaseDate, fromDate),
				lte(transactions.purchaseDate, toDate),
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
				eq(transactions.userId, userId),
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
					eq(transactions.userId, userId),
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
		if (!payInvoice) {
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
					eq(importBatches.userId, userId),
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
			skippedCount: 0,
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
			imported: 0,
			skipped: 0,
			importBatchId,
		};
	}

	const importBatchId = parsed.data.importBatchId ?? randomUUID();

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

	const transferCategory = hasTransferRows
		? await db.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, userId),
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
					eq(financialAccounts.userId, userId),
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
				transactionType:
					row.transactionType === "income" ? "Receita" : "Despesa",
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
		const period =
			invoicePeriod ??
			`${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, "0")}`;
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
				userId,
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
				userId,
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

	let inserted: { id: string }[] = [];

	try {
		inserted = await db.transaction(async (tx) => {
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

			const existingFitIds = new Set<string>();
			if (fitIdsInBatch.length > 0) {
				const duplicateRows = await tx
					.select({ ofxFitId: transactions.ofxFitId })
					.from(transactions)
					.where(
						and(
							eq(transactions.userId, userId),
							inArray(transactions.ofxFitId, fitIdsInBatch),
						),
					);

				for (const row of duplicateRows) {
					if (row.ofxFitId) {
						existingFitIds.add(row.ofxFitId);
					}
				}
			}

			const seenFitIdsInBatch = new Set<string>();
			const recordsToInsert = allRecords.filter((record) => {
				if (!record.ofxFitId) return true;
				if (existingFitIds.has(record.ofxFitId)) return false;
				if (seenFitIdsInBatch.has(record.ofxFitId)) return false;
				seenFitIdsInBatch.add(record.ofxFitId);
				return true;
			});

			const insertedRows =
				recordsToInsert.length > 0
					? await tx
							.insert(transactions)
							.values(recordsToInsert)
							.returning({ id: transactions.id })
					: [];

			for (const record of invoicePaymentRecords) {
				await upsertInvoicePaymentStatus(tx, {
					userId,
					cardId: record.settleCardId,
					period: record.settlePeriod,
					paymentStatus: INVOICE_PAYMENT_STATUS.PAID,
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
	if (hasInvoicePayments || payInvoice) {
		await revalidateForEntity("cards", userId);
	}
	if (hasTransferRows) {
		await revalidateForEntity("accounts", userId);
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
