import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3_BUCKET, s3 } from "./s3-client";

export async function putS3Object(
	fileKey: string,
	body: Buffer | Uint8Array,
	mimeType: string,
): Promise<void> {
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
	const command = new PutObjectCommand({
		Bucket: S3_BUCKET,
		Key: fileKey,
		ContentType: mimeType,
	});
	return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutos
}

const MAX_INLINE_DOWNLOAD_BYTES = 5 * 1024 * 1024;

export async function getS3ObjectBuffer(fileKey: string): Promise<Buffer> {
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

export function canInlineDownloadS3Object(contentLength: number | null): boolean {
	return (
		contentLength != null &&
		contentLength > 0 &&
		contentLength <= MAX_INLINE_DOWNLOAD_BYTES
	);
}

export async function createPresignedGetUrl(fileKey: string): Promise<string> {
	const command = new GetObjectCommand({
		Bucket: S3_BUCKET,
		Key: fileKey,
	});
	return getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hora
}

export async function headS3Object(fileKey: string): Promise<{
	contentLength: number | null;
	contentType: string | null;
}> {
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
