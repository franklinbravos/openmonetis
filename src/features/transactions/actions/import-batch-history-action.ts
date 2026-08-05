"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { importBatches } from "@/db/schema";
import { fetchImportBatchHistory } from "@/features/transactions/queries/import-batch-history";
import type { ImportFileHistoryEntry } from "@/features/transactions/lib/import-file-duplicate";
import {
	importBatchDraftDataSchema,
	parseImportBatchDraftData,
	type ImportBatchDraftData,
} from "@/features/transactions/lib/import-batch-draft";
import { IMPORT_BATCH_STATUS } from "@/features/transactions/lib/import-batch-status";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	canInlineDownloadS3Object,
	createPresignedGetUrl,
	getS3ObjectBuffer,
	headS3Object,
} from "@/shared/lib/storage/presign";
import { uuidSchema } from "@/shared/lib/schemas/common";

const historySchema = z.object({
	cardId: uuidSchema("Cartão").nullable().optional(),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable()
		.optional(),
	limit: z.number().int().min(1).max(100).optional(),
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
		const data = registerUploadSchema.parse(input);
		const importBatchId = randomUUID();

		await db.insert(importBatches).values({
			id: importBatchId,
			userId,
			sourceFileName: data.sourceFileName,
			sourceFileSize: data.sourceFileSize,
			cardId: data.cardId ?? null,
			invoicePeriod: data.invoicePeriod ?? null,
			accountId: data.accountId ?? null,
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

export async function saveImportBatchDraftAction(
	input: z.infer<typeof saveDraftSchema>,
): Promise<{ success: boolean; message?: string; error?: string }> {
	try {
		const userId = await getUserId();
		const data = saveDraftSchema.parse(input);

		const batch = await db.query.importBatches.findFirst({
			columns: {
				id: true,
				status: true,
			},
			where: and(
				eq(importBatches.userId, userId),
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
				and(eq(importBatches.userId, userId), eq(importBatches.id, data.batchId)),
			);

		revalidatePath("/transactions/import");
		revalidatePath("/transactions/import/history");

		return {
			success: true,
			message: "Importação salva. Continue depois pelo histórico.",
		};
	} catch (error) {
		console.error("[saveImportBatchDraftAction]", error);

		if (
			error instanceof Error &&
			error.message.includes("dados_rascunho")
		) {
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
	const data = historySchema.parse(input);

	return fetchImportBatchHistory({
		userId,
		cardId: data.cardId ?? null,
		invoicePeriod: data.invoicePeriod ?? null,
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
			},
			where: and(
				eq(importBatches.userId, userId),
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

		const fileKey = batch.attachment?.fileKey;
		let downloadUrl: string | null = null;
		let fileContentBase64: string | null = null;
		let mimeType: string | null = null;

		if (fileKey) {
			try {
				const objectMetadata = await headS3Object(fileKey);

				if (canInlineDownloadS3Object(objectMetadata.contentLength)) {
					const fileBuffer = await getS3ObjectBuffer(fileKey);
					fileContentBase64 = fileBuffer.toString("base64");
					mimeType =
						objectMetadata.contentType ?? "application/octet-stream";
				} else {
					downloadUrl = await createPresignedGetUrl(fileKey);
				}
			} catch (error) {
				console.error("[getImportBatchResumeAction] storage read failed", error);
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

		if (
			error instanceof Error &&
			error.message.includes("dados_rascunho")
		) {
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
	{ success: true; url: string; fileName: string } | { success: false; error: string }
> {
	const userId = await getUserId();
	const data = downloadSchema.parse(input);

	const batch = await db.query.importBatches.findFirst({
		columns: {
			sourceFileName: true,
		},
		where: and(
			eq(importBatches.userId, userId),
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

	const fileKey = batch?.attachment?.fileKey;
	if (!batch || !fileKey) {
		return { success: false, error: "Arquivo de importação não encontrado." };
	}

	const url = await createPresignedGetUrl(fileKey);
	return { success: true, url, fileName: batch.sourceFileName };
}
