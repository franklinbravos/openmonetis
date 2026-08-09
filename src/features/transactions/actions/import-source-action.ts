"use server";

import crypto, { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";
import { attachments, importBatches } from "@/db/schema";
import { IMPORT_BATCH_STATUS } from "@/features/transactions/lib/import-batch-status";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { MAX_FILE_SIZE } from "@/shared/lib/attachments/config";
import { getUser, getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	isAllowedImportSourceMimeType,
	resolveImportFileMimeType,
} from "@/shared/lib/import/source-mime";
import { uuidSchema } from "@/shared/lib/schemas/common";
import {
	getStorageConfigurationErrorMessage,
	isObjectStorageConfigured,
} from "@/shared/lib/storage/config";
import {
	createPresignedGetUrl,
	createPresignedPutUrl,
	headS3Object,
	putS3Object,
} from "@/shared/lib/storage/presign";

const UPLOAD_TOKEN_EXPIRY_SECONDS = 10 * 60;

const presignSchema = z.object({
	fileName: z.string().min(1),
	mimeType: z.string().min(1),
	fileSize: z
		.number()
		.int()
		.positive()
		.max(MAX_FILE_SIZE, "Arquivo deve ter no máximo 50MB."),
	importBatchId: z.string().uuid(),
});

const confirmSchema = z.object({
	uploadToken: z.string().min(1),
	importBatchId: z.string().uuid(),
	sourceFileName: z.string().min(1),
	importedCount: z.number().int().min(0),
	skippedCount: z.number().int().min(0),
	cardId: uuidSchema("Cartão").nullable().optional(),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.nullable()
		.optional(),
	accountId: uuidSchema("Conta").nullable().optional(),
});

const downloadSchema = z.object({
	cardId: uuidSchema("Cartão"),
	invoicePeriod: z.string().regex(/^\d{4}-\d{2}$/),
});

type ImportSourceUploadTokenPayload = {
	userId: string;
	importBatchId: string;
	fileKey: string;
	fileName: string;
	mimeType: string;
	fileSize: number;
	exp: number;
};

type PresignResult =
	| {
			success: true;
			presignedUrl: string;
			uploadToken: string;
	  }
	| { success: false; error: string };

function getUploadTokenSecret(): string {
	const secret = process.env.APP_SECRET;
	if (!secret) {
		throw new Error("APP_SECRET is required. Set it in your .env file.");
	}
	return secret;
}

function base64UrlEncode(value: string): string {
	return Buffer.from(value)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

function base64UrlDecode(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const pad = normalized.length % 4;
	const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
	return Buffer.from(padded, "base64").toString("utf8");
}

function signUploadToken(payload: ImportSourceUploadTokenPayload): string {
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const signature = crypto
		.createHmac("sha256", getUploadTokenSecret())
		.update(encodedPayload)
		.digest("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");

	return `${encodedPayload}.${signature}`;
}

function verifyUploadToken(
	token: string,
): ImportSourceUploadTokenPayload | null {
	try {
		const [encodedPayload, signature] = token.split(".");
		if (!encodedPayload || !signature) return null;

		const expectedSignature = crypto
			.createHmac("sha256", getUploadTokenSecret())
			.update(encodedPayload)
			.digest("base64")
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");

		if (
			!crypto.timingSafeEqual(
				Buffer.from(signature),
				Buffer.from(expectedSignature),
			)
		) {
			return null;
		}

		const payload = JSON.parse(
			base64UrlDecode(encodedPayload),
		) as ImportSourceUploadTokenPayload;
		const now = Math.floor(Date.now() / 1000);

		if (payload.exp < now) return null;
		if (!payload.fileKey.startsWith(`${payload.userId}/`)) return null;
		if (!isAllowedImportSourceMimeType(payload.mimeType)) return null;
		if (payload.fileSize <= 0 || payload.fileSize > MAX_FILE_SIZE) return null;

		return payload;
	} catch {
		return null;
	}
}

type AttachImportSourceInput = {
	userId: string;
	importBatchId: string;
	fileKey: string;
	sourceFileName: string;
	fileSize: number;
	mimeType: string;
	importedCount: number;
	skippedCount: number;
	cardId: string | null;
	invoicePeriod: string | null;
	accountId: string | null;
};

async function attachImportSourceFileToBatch({
	userId,
	importBatchId,
	fileKey,
	sourceFileName,
	fileSize,
	mimeType,
	importedCount,
	skippedCount,
	cardId,
	invoicePeriod,
	accountId,
}: AttachImportSourceInput): Promise<void> {
	const [attachment] = await db
		.insert(attachments)
		.values({
			userId,
			fileKey,
			fileName: sourceFileName,
			fileSize,
			mimeType,
		})
		.returning({ id: attachments.id });

	const existingBatch = await db.query.importBatches.findFirst({
		columns: { id: true },
		where: and(
			eq(importBatches.userId, userId),
			eq(importBatches.id, importBatchId),
		),
	});

	const batchPayload = {
		attachmentId: attachment.id,
		sourceFileName,
		sourceFileSize: fileSize,
		importedCount,
		skippedCount,
		cardId,
		invoicePeriod,
		accountId,
		status:
			importedCount > 0
				? IMPORT_BATCH_STATUS.IMPORTED
				: IMPORT_BATCH_STATUS.UPLOADED,
	};

	if (existingBatch) {
		await db
			.update(importBatches)
			.set(batchPayload)
			.where(eq(importBatches.id, importBatchId));
		return;
	}

	await db.insert(importBatches).values({
		id: importBatchId,
		userId,
		...batchPayload,
	});
}

export async function uploadImportSourceFileDirectAction(
	formData: FormData,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!isObjectStorageConfigured()) {
			return {
				success: false,
				error: getStorageConfigurationErrorMessage(),
			};
		}

		const user = await getUser();
		const file = formData.get("file");

		if (!(file instanceof File)) {
			return { success: false, error: "Arquivo inválido." };
		}

		if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
			return {
				success: false,
				error: "Arquivo deve ter entre 1 byte e 50MB.",
			};
		}

		const importBatchId = String(formData.get("importBatchId") ?? "");
		const sourceFileName = String(
			formData.get("sourceFileName") ?? file.name,
		).trim();
		const importedCount = Number(formData.get("importedCount") ?? 0);
		const skippedCount = Number(formData.get("skippedCount") ?? 0);
		const cardIdRaw = formData.get("cardId");
		const invoicePeriodRaw = formData.get("invoicePeriod");
		const accountIdRaw = formData.get("accountId");

		if (!importBatchId || !z.string().uuid().safeParse(importBatchId).success) {
			return { success: false, error: "Lote de importação inválido." };
		}

		const mimeType = isAllowedImportSourceMimeType(file.type)
			? file.type
			: resolveImportFileMimeType(file);

		const ext = sourceFileName.split(".").pop()?.toLowerCase() ?? "bin";
		const fileKey = `${user.id}/${randomUUID()}.${ext}`;
		const fileBuffer = Buffer.from(await file.arrayBuffer());

		await putS3Object(fileKey, fileBuffer, mimeType);

		await attachImportSourceFileToBatch({
			userId: user.id,
			importBatchId,
			fileKey,
			sourceFileName,
			fileSize: file.size,
			mimeType,
			importedCount: Number.isFinite(importedCount) ? importedCount : 0,
			skippedCount: Number.isFinite(skippedCount) ? skippedCount : 0,
			cardId:
				typeof cardIdRaw === "string" && cardIdRaw.length > 0
					? cardIdRaw
					: null,
			invoicePeriod:
				typeof invoicePeriodRaw === "string" && invoicePeriodRaw.length > 0
					? invoicePeriodRaw
					: null,
			accountId:
				typeof accountIdRaw === "string" && accountIdRaw.length > 0
					? accountIdRaw
					: null,
		});

		return { success: true };
	} catch (error) {
		console.error("[uploadImportSourceFileDirectAction]", error);
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function getImportSourcePresignAction(input: {
	fileName: string;
	mimeType: string;
	fileSize: number;
	importBatchId: string;
}): Promise<PresignResult> {
	try {
		if (!isObjectStorageConfigured()) {
			return {
				success: false,
				error: getStorageConfigurationErrorMessage(),
			};
		}

		const user = await getUser();
		const data = presignSchema.parse(input);
		const mimeType = isAllowedImportSourceMimeType(data.mimeType)
			? data.mimeType
			: resolveImportFileMimeType(
					new File([""], data.fileName, { type: data.mimeType }),
				);

		const ext = data.fileName.split(".").pop()?.toLowerCase() ?? "bin";
		const fileKey = `${user.id}/${randomUUID()}.${ext}`;
		const presignedUrl = await createPresignedPutUrl(fileKey, mimeType);
		const uploadToken = signUploadToken({
			userId: user.id,
			importBatchId: data.importBatchId,
			fileKey,
			fileName: data.fileName,
			mimeType,
			fileSize: data.fileSize,
			exp: Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_EXPIRY_SECONDS,
		});

		return { success: true, presignedUrl, uploadToken };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function confirmImportSourceUploadAction(
	input: z.infer<typeof confirmSchema>,
): Promise<{ success: boolean; error?: string }> {
	try {
		const user = await getUser();
		const data = confirmSchema.parse(input);
		const uploadPayload = verifyUploadToken(data.uploadToken);

		if (
			!uploadPayload ||
			uploadPayload.userId !== user.id ||
			uploadPayload.importBatchId !== data.importBatchId
		) {
			return { success: false, error: "Upload inválido ou expirado." };
		}

		const objectMetadata = await headS3Object(uploadPayload.fileKey);

		if (!objectMetadata.contentLength || objectMetadata.contentLength <= 0) {
			return { success: false, error: "Arquivo enviado não encontrado." };
		}

		if (objectMetadata.contentLength > MAX_FILE_SIZE) {
			return {
				success: false,
				error: "O arquivo enviado excede o limite permitido de 50MB.",
			};
		}

		await attachImportSourceFileToBatch({
			userId: user.id,
			importBatchId: data.importBatchId,
			fileKey: uploadPayload.fileKey,
			sourceFileName: data.sourceFileName,
			fileSize: objectMetadata.contentLength,
			mimeType: uploadPayload.mimeType,
			importedCount: data.importedCount,
			skippedCount: data.skippedCount,
			cardId: data.cardId ?? null,
			invoicePeriod: data.invoicePeriod ?? null,
			accountId: data.accountId ?? null,
		});

		return { success: true };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

export async function getImportSourceDownloadUrlAction(input: {
	cardId: string;
	invoicePeriod: string;
}): Promise<
	| { success: true; url: string; fileName: string }
	| { success: false; error: string }
> {
	try {
		const userId = await getUserId();
		const data = downloadSchema.parse(input);

		const batch = await db.query.importBatches.findFirst({
			columns: {
				sourceFileName: true,
			},
			where: and(
				eq(importBatches.userId, userId),
				eq(importBatches.cardId, data.cardId),
				eq(importBatches.invoicePeriod, data.invoicePeriod),
				isNotNull(importBatches.attachmentId),
			),
			orderBy: [desc(importBatches.createdAt)],
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
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}
