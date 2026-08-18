"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { attachments, importBatches, transactions } from "@/db/schema";
import {
	type ImportBatchDraftData,
	importBatchDraftDataSchema,
	parseImportBatchDraftData,
} from "@/features/transactions/lib/import-batch-draft";
import { IMPORT_BATCH_STATUS } from "@/features/transactions/lib/import-batch-status";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import { fetchImportBatchHistory } from "@/features/transactions/queries/import-batch-history";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { assertFinancialEditAccess } from "@/shared/lib/payers/financial-access";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { uuidSchema } from "@/shared/lib/schemas/common";
import {
	canInlineDownloadS3Object,
	createPresignedGetUrl,
	deleteS3Object,
	getS3ObjectBuffer,
	headS3Object,
} from "@/shared/lib/storage/presign";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";

async function resolveImportBatchFileKey(batch: {
	attachment?: { fileKey?: string | null } | null;
	attachmentId?: string | null;
}): Promise<string | null> {
	if (batch.attachment?.fileKey) {
		return batch.attachment.fileKey;
	}

	if (!batch.attachmentId) {
		return null;
	}

	const attachment = await db.query.attachments.findFirst({
		columns: { fileKey: true },
		where: eq(attachments.id, batch.attachmentId),
	});

	return attachment?.fileKey ?? null;
}

const historySchema = z.object({
	cardId: uuidSchema("Cartão").nullable().optional(),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable()
		.optional(),
	accountId: uuidSchema("Conta").nullable().optional(),
	limit: z.number().int().min(1).max(100).optional(),
});

const sourceFileRowSchema = z.object({
	externalId: z.string().nullable(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	amount: z.number().positive(),
	transactionType: z.enum(["income", "expense"]),
	description: z.string().min(1),
});

const registerUploadSchema = z.object({
	sourceFileName: z.string().trim().min(1),
	sourceFileSize: z.number().int().positive(),
	cardId: uuidSchema("Cartão").nullable().optional(),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable()
		.optional(),
	accountId: uuidSchema("Conta").nullable().optional(),
	sourceInvoiceTotal: z.number().positive().nullable().optional(),
	sourceInvoiceTotalKind: z
		.enum(["ofx_ledger", "pdf_header", "pdf_lines_fallback", "lines_fallback"])
		.nullable()
		.optional(),
	sourceFileRows: z.array(sourceFileRowSchema).max(2000).optional(),
});

const syncSourceTotalSchema = z.object({
	batchId: z.string().uuid(),
	sourceInvoiceTotal: z.number().positive().nullable(),
	sourceInvoiceTotalKind: z
		.enum(["ofx_ledger", "pdf_header", "pdf_lines_fallback", "lines_fallback"])
		.nullable(),
	sourceFileRows: z.array(sourceFileRowSchema).max(2000).optional(),
});

const downloadSchema = z.object({
	batchId: z.string().uuid(),
});

export async function registerImportUploadAction(
	input: z.infer<typeof registerUploadSchema>,
): Promise<
	{ success: true; importBatchId: string } | { success: false; error: string }
> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
		const data = registerUploadSchema.parse(input);
		const importBatchId = randomUUID();

		await db.insert(importBatches).values({
			id: importBatchId,
			userId: dataOwnerUserId,
			sourceFileName: data.sourceFileName,
			sourceFileSize: data.sourceFileSize,
			cardId: data.cardId ?? null,
			invoicePeriod: data.invoicePeriod ?? null,
			accountId: data.accountId ?? null,
			sourceInvoiceTotal:
				data.sourceInvoiceTotal != null
					? formatDecimalForDbRequired(data.sourceInvoiceTotal)
					: null,
			sourceInvoiceTotalKind: data.sourceInvoiceTotalKind ?? null,
			sourceFileRows: data.sourceFileRows ?? null,
			importedCount: 0,
			skippedCount: 0,
			status: IMPORT_BATCH_STATUS.UPLOADED,
		});

		revalidatePath("/transactions/import");
		revalidatePath("/transactions/import/history");

		return { success: true, importBatchId };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function syncImportBatchSourceTotalAction(
	input: z.infer<typeof syncSourceTotalSchema>,
): Promise<{ success: boolean; error?: string }> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
		const data = syncSourceTotalSchema.parse(input);

		const updated = await db
			.update(importBatches)
			.set({
				sourceInvoiceTotal:
					data.sourceInvoiceTotal != null
						? formatDecimalForDbRequired(data.sourceInvoiceTotal)
						: null,
				sourceInvoiceTotalKind: data.sourceInvoiceTotalKind,
				...(data.sourceFileRows ? { sourceFileRows: data.sourceFileRows } : {}),
			})
			.where(
				and(
					eq(importBatches.userId, dataOwnerUserId),
					eq(importBatches.id, data.batchId),
				),
			)
			.returning({ id: importBatches.id });

		if (updated.length === 0) {
			return { success: false, error: "Importação não encontrada." };
		}

		return { success: true };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

const syncBatchContextSchema = z.object({
	batchId: z.string().uuid(),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable()
		.optional(),
	cardId: uuidSchema("Cartão").nullable().optional(),
	accountId: uuidSchema("Conta").nullable().optional(),
});

export async function syncImportBatchContextAction(
	input: z.infer<typeof syncBatchContextSchema>,
): Promise<{ success: boolean; error?: string }> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
		const data = syncBatchContextSchema.parse(input);

		const updated = await db
			.update(importBatches)
			.set({
				invoicePeriod: data.invoicePeriod ?? null,
				cardId: data.cardId ?? null,
				accountId: data.accountId ?? null,
			})
			.where(
				and(
					eq(importBatches.userId, dataOwnerUserId),
					eq(importBatches.id, data.batchId),
				),
			)
			.returning({ id: importBatches.id });

		if (updated.length === 0) {
			return { success: false, error: "Importação não encontrada." };
		}

		revalidatePath("/transactions/import");
		revalidatePath("/transactions/import/history");
		revalidatePath("/cards");

		return { success: true };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function saveImportBatchDraftAction(
	input: z.infer<typeof saveDraftSchema>,
): Promise<{ success: boolean; message?: string; error?: string }> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
		const data = saveDraftSchema.parse(input);

		const batch = await db.query.importBatches.findFirst({
			columns: {
				id: true,
				status: true,
			},
			where: and(
				eq(importBatches.userId, dataOwnerUserId),
				eq(importBatches.id, data.batchId),
			),
		});

		if (!batch) {
			return { success: false, error: "Importação não encontrada." };
		}

		if (batch.status === IMPORT_BATCH_STATUS.IMPORTED) {
			return { success: false, error: "Esta importação já foi concluída." };
		}

		await db
			.update(importBatches)
			.set({
				draftData: data.draftData,
				status: IMPORT_BATCH_STATUS.DRAFT,
				cardId: data.cardId ?? null,
				invoicePeriod: data.invoicePeriod ?? null,
				accountId: data.accountId ?? null,
			})
			.where(
				and(
					eq(importBatches.userId, dataOwnerUserId),
					eq(importBatches.id, data.batchId),
				),
			);

		revalidatePath("/transactions/import");
		revalidatePath("/transactions/import/history");

		return {
			success: true,
			message: "Importação salva. Continue depois pelo histórico.",
		};
	} catch (error) {
		console.error("[saveImportBatchDraftAction]", error);

		if (error instanceof Error && error.message.includes("dados_rascunho")) {
			return {
				success: false,
				error:
					"Banco desatualizado. Execute pnpm run db:push e tente novamente.",
			};
		}

		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function fetchImportBatchHistoryAction(
	input: z.infer<typeof historySchema> = {},
): Promise<ImportFileHistoryEntry[]> {
	const userId = await getUserId();
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const data = historySchema.parse(input);

	return fetchImportBatchHistory({
		userId: dataOwnerUserId,
		cardId: data.cardId ?? null,
		invoicePeriod: data.invoicePeriod ?? null,
		accountId: data.accountId ?? null,
		limit: data.limit ?? 20,
	});
}

const saveDraftSchema = z.object({
	batchId: z.string().uuid(),
	draftData: importBatchDraftDataSchema,
	cardId: uuidSchema("Cartão").nullable().optional(),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable()
		.optional(),
	accountId: uuidSchema("Conta").nullable().optional(),
});

const resumeSchema = z.object({
	batchId: z.string().uuid(),
});

export async function getImportBatchDraftAction(input: {
	batchId: string;
}): Promise<
	| { success: true; draftData: ImportBatchDraftData | null }
	| { success: false; error: string }
> {
	try {
		const userId = await getUserId();
		const dataOwnerUserId = await getFinancialDataOwnerId(userId);
		const data = resumeSchema.parse(input);

		const batch = await db.query.importBatches.findFirst({
			columns: {
				id: true,
				status: true,
				draftData: true,
			},
			where: and(
				eq(importBatches.userId, dataOwnerUserId),
				eq(importBatches.id, data.batchId),
			),
		});

		if (!batch) {
			return { success: false, error: "Importação não encontrada." };
		}

		if (batch.status === IMPORT_BATCH_STATUS.IMPORTED) {
			return { success: false, error: "Esta importação já foi concluída." };
		}

		return {
			success: true,
			draftData: parseImportBatchDraftData(batch.draftData),
		};
	} catch (error) {
		console.error("[getImportBatchDraftAction]", error);

		if (error instanceof Error && error.message.includes("dados_rascunho")) {
			return {
				success: false,
				error:
					"Banco desatualizado. Execute pnpm run db:push e tente novamente.",
			};
		}

		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function getImportBatchResumeAction(input: {
	batchId: string;
}): Promise<
	| {
			success: true;
			batchId: string;
			sourceFileName: string;
			sourceFileSize: number | null;
			cardId: string | null;
			invoicePeriod: string | null;
			downloadUrl: string | null;
			fileContentBase64: string | null;
			mimeType: string | null;
			draftData: ImportBatchDraftData | null;
	  }
	| { success: false; error: string }
> {
	try {
		const userId = await getUserId();
		const dataOwnerUserId = await getFinancialDataOwnerId(userId);
		const data = resumeSchema.parse(input);

		const batch = await db.query.importBatches.findFirst({
			columns: {
				id: true,
				sourceFileName: true,
				sourceFileSize: true,
				cardId: true,
				invoicePeriod: true,
				status: true,
				draftData: true,
				attachmentId: true,
			},
			where: and(
				eq(importBatches.userId, dataOwnerUserId),
				eq(importBatches.id, data.batchId),
			),
			with: {
				attachment: {
					columns: {
						fileKey: true,
					},
				},
			},
		});

		if (!batch) {
			return { success: false, error: "Importação não encontrada." };
		}

		if (batch.status === IMPORT_BATCH_STATUS.IMPORTED) {
			return { success: false, error: "Esta importação já foi concluída." };
		}

		const fileKey = await resolveImportBatchFileKey(batch);
		let downloadUrl: string | null = null;
		let fileContentBase64: string | null = null;
		let mimeType: string | null = null;

		if (fileKey) {
			try {
				const objectMetadata = await headS3Object(fileKey);

				if (canInlineDownloadS3Object(objectMetadata.contentLength)) {
					const fileBuffer = await getS3ObjectBuffer(fileKey);
					fileContentBase64 = fileBuffer.toString("base64");
					mimeType = objectMetadata.contentType ?? "application/octet-stream";
				} else {
					downloadUrl = await createPresignedGetUrl(fileKey);
				}
			} catch (error) {
				console.error(
					"[getImportBatchResumeAction] storage read failed",
					error,
				);
			}
		}

		return {
			success: true,
			batchId: batch.id,
			sourceFileName: batch.sourceFileName,
			sourceFileSize: batch.sourceFileSize,
			cardId: batch.cardId,
			invoicePeriod: batch.invoicePeriod,
			downloadUrl,
			fileContentBase64,
			mimeType,
			draftData: parseImportBatchDraftData(batch.draftData),
		};
	} catch (error) {
		console.error("[getImportBatchResumeAction]", error);

		if (error instanceof Error && error.message.includes("dados_rascunho")) {
			return {
				success: false,
				error:
					"Banco desatualizado. Execute pnpm run db:push e tente novamente.",
			};
		}

		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function getImportBatchDownloadUrlAction(input: {
	batchId: string;
}): Promise<
	| { success: true; url: string; fileName: string }
	| { success: false; error: string }
> {
	const userId = await getUserId();
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const data = downloadSchema.parse(input);

	const batch = await db.query.importBatches.findFirst({
		columns: {
			sourceFileName: true,
			attachmentId: true,
		},
		where: and(
			eq(importBatches.userId, dataOwnerUserId),
			eq(importBatches.id, data.batchId),
		),
		with: {
			attachment: {
				columns: {
					fileKey: true,
				},
			},
		},
	});

	const fileKey = batch ? await resolveImportBatchFileKey(batch) : null;
	if (!batch || !fileKey) {
		return { success: false, error: "Arquivo de importação não encontrado." };
	}

	const url = await createPresignedGetUrl(fileKey);
	return { success: true, url, fileName: batch.sourceFileName };
}

export async function deleteImportBatchAction(input: {
	batchId: string;
}): Promise<{ success: boolean; error?: string; message?: string }> {
	try {
		const userId = await getUserId();
		const { dataOwnerUserId } = await assertFinancialEditAccess(userId);
		const data = downloadSchema.parse(input);

		const batch = await db.query.importBatches.findFirst({
			columns: {
				id: true,
				status: true,
				attachmentId: true,
			},
			where: and(
				eq(importBatches.userId, dataOwnerUserId),
				eq(importBatches.id, data.batchId),
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

		if (!batch) {
			return { success: false, error: "Importação não encontrada." };
		}

		if (batch.status === IMPORT_BATCH_STATUS.IMPORTED) {
			return {
				success: false,
				error: "Não é possível excluir importações já concluídas.",
			};
		}

		await db
			.delete(transactions)
			.where(
				and(
					eq(transactions.userId, dataOwnerUserId),
					eq(transactions.importBatchId, data.batchId),
				),
			);

		const fileKey = await resolveImportBatchFileKey(batch);
		if (fileKey) {
			await deleteS3Object(fileKey).catch(() => {});
		}

		if (batch.attachmentId) {
			await db
				.delete(attachments)
				.where(eq(attachments.id, batch.attachmentId));
		}

		await db
			.delete(importBatches)
			.where(
				and(
					eq(importBatches.userId, dataOwnerUserId),
					eq(importBatches.id, data.batchId),
				),
			);

		revalidatePath("/transactions/import");
		revalidatePath("/transactions/import/history");
		revalidatePath("/cards");

		return { success: true, message: "Importação excluída." };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}
