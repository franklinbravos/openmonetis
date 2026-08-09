import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
	getStorageBackend,
	getStorageBucket,
} from "@/shared/lib/storage/config";
import { S3_BUCKET, s3 } from "@/shared/lib/storage/s3-client";
import {
	ensureSupabaseStorageBucket,
	getSupabaseAdmin,
} from "@/shared/lib/storage/supabase-admin";

export const MAX_INLINE_DOWNLOAD_BYTES = 5 * 1024 * 1024;

type StorageObjectMetadata = {
	contentLength: number | null;
	contentType: string | null;
};

function splitStoragePath(fileKey: string): {
	folder: string;
	fileName: string;
} {
	const parts = fileKey.split("/");
	const fileName = parts.pop() ?? fileKey;
	return {
		folder: parts.join("/"),
		fileName,
	};
}

async function getSupabaseObjectMetadata(
	fileKey: string,
): Promise<StorageObjectMetadata> {
	const supabase = getSupabaseAdmin();
	const bucket = getStorageBucket();
	const { folder, fileName } = splitStoragePath(fileKey);

	const { data, error } = await supabase.storage.from(bucket).list(folder, {
		limit: 100,
		search: fileName,
	});

	if (!error && data) {
		const entry = data.find((item) => item.name === fileName);
		if (entry) {
			return {
				contentLength: entry.metadata?.size ?? null,
				contentType: entry.metadata?.mimetype ?? null,
			};
		}
	}

	const { data: blob, error: downloadError } = await supabase.storage
		.from(bucket)
		.download(fileKey);

	if (downloadError || !blob) {
		return { contentLength: null, contentType: null };
	}

	return {
		contentLength: blob.size,
		contentType: blob.type || null,
	};
}

export async function putS3Object(
	fileKey: string,
	body: Buffer | Uint8Array,
	mimeType: string,
): Promise<void> {
	const backend = getStorageBackend();
	if (backend === "supabase") {
		await ensureSupabaseStorageBucket();
		const supabase = getSupabaseAdmin();
		const bucket = getStorageBucket();
		const { error } = await supabase.storage
			.from(bucket)
			.upload(fileKey, body, {
				contentType: mimeType,
				upsert: true,
			});
		if (error) throw error;
		return;
	}

	const command = new PutObjectCommand({
		Bucket: S3_BUCKET,
		Key: fileKey,
		Body: body,
		ContentType: mimeType,
	});
	await s3.send(command);
}

export async function createPresignedPutUrl(
	fileKey: string,
	mimeType: string,
): Promise<string> {
	const backend = getStorageBackend();
	if (backend === "supabase") {
		await ensureSupabaseStorageBucket();
		const supabase = getSupabaseAdmin();
		const bucket = getStorageBucket();
		const { data, error } = await supabase.storage
			.from(bucket)
			.createSignedUploadUrl(fileKey, { upsert: true });

		if (error) throw error;
		if (!data?.signedUrl) {
			throw new Error("Não foi possível gerar URL de upload assinada.");
		}

		return data.signedUrl;
	}

	const command = new PutObjectCommand({
		Bucket: S3_BUCKET,
		Key: fileKey,
		ContentType: mimeType,
	});
	return getSignedUrl(s3, command, { expiresIn: 300 });
}

export async function getS3ObjectBuffer(fileKey: string): Promise<Buffer> {
	const backend = getStorageBackend();
	if (backend === "supabase") {
		const supabase = getSupabaseAdmin();
		const bucket = getStorageBucket();
		const { data, error } = await supabase.storage
			.from(bucket)
			.download(fileKey);

		if (error) throw error;
		if (!data) {
			throw new Error("Arquivo vazio ou indisponível no storage.");
		}

		const bytes = await data.arrayBuffer();
		if (bytes.byteLength === 0) {
			throw new Error("Arquivo vazio ou indisponível no storage.");
		}

		return Buffer.from(bytes);
	}

	const command = new GetObjectCommand({
		Bucket: S3_BUCKET,
		Key: fileKey,
	});
	const result = await s3.send(command);
	const bytes = await result.Body?.transformToByteArray();

	if (!bytes || bytes.length === 0) {
		throw new Error("Arquivo vazio ou indisponível no storage.");
	}

	return Buffer.from(bytes);
}

export function canInlineDownloadS3Object(
	contentLength: number | null,
): boolean {
	return (
		contentLength != null &&
		contentLength > 0 &&
		contentLength <= MAX_INLINE_DOWNLOAD_BYTES
	);
}

export async function createPresignedGetUrl(fileKey: string): Promise<string> {
	const backend = getStorageBackend();
	if (backend === "supabase") {
		const supabase = getSupabaseAdmin();
		const bucket = getStorageBucket();
		const { data, error } = await supabase.storage
			.from(bucket)
			.createSignedUrl(fileKey, 3600);

		if (error) throw error;
		if (!data?.signedUrl) {
			throw new Error("Não foi possível gerar URL de download assinada.");
		}

		return data.signedUrl;
	}

	const command = new GetObjectCommand({
		Bucket: S3_BUCKET,
		Key: fileKey,
	});
	return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function headS3Object(
	fileKey: string,
): Promise<StorageObjectMetadata> {
	const backend = getStorageBackend();
	if (backend === "supabase") {
		return getSupabaseObjectMetadata(fileKey);
	}

	const command = new HeadObjectCommand({
		Bucket: S3_BUCKET,
		Key: fileKey,
	});
	const result = await s3.send(command);

	return {
		contentLength: result.ContentLength ?? null,
		contentType: result.ContentType ?? null,
	};
}

export async function deleteS3Object(fileKey: string): Promise<void> {
	const backend = getStorageBackend();
	if (backend === "supabase") {
		const supabase = getSupabaseAdmin();
		const bucket = getStorageBucket();
		const { error } = await supabase.storage.from(bucket).remove([fileKey]);
		if (error) throw error;
		return;
	}

	const command = new DeleteObjectCommand({
		Bucket: S3_BUCKET,
		Key: fileKey,
	});
	try {
		await s3.send(command);
	} catch (err) {
		if (
			err instanceof Error &&
			"Code" in err &&
			(err as { Code: string }).Code === "NoSuchKey"
		) {
			return;
		}
		throw err;
	}
}

export async function copyStorageObject(
	sourceFileKey: string,
	targetFileKey: string,
	mimeType: string,
): Promise<void> {
	const backend = getStorageBackend();
	if (backend === "supabase") {
		const buffer = await getS3ObjectBuffer(sourceFileKey);
		await putS3Object(targetFileKey, buffer, mimeType);
		return;
	}

	await s3.send(
		new CopyObjectCommand({
			Bucket: S3_BUCKET,
			CopySource: `${S3_BUCKET}/${sourceFileKey}`,
			Key: targetFileKey,
			ContentType: mimeType,
			MetadataDirective: "COPY",
		}),
	);
}
