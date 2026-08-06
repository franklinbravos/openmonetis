export type StorageBackend = "supabase" | "s3";

export function isSupabaseStorageConfigured(): boolean {
	return Boolean(
		process.env.SUPABASE_URL?.trim() &&
			process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
			process.env.SUPABASE_STORAGE_BUCKET?.trim(),
	);
}

export function isS3StorageConfigured(): boolean {
	return Boolean(
		process.env.S3_ENDPOINT?.trim() &&
			process.env.S3_ACCESS_KEY_ID?.trim() &&
			process.env.S3_SECRET_ACCESS_KEY?.trim() &&
			process.env.S3_BUCKET?.trim(),
	);
}

export function getStorageBackend(): StorageBackend | null {
	if (isSupabaseStorageConfigured()) return "supabase";
	if (isS3StorageConfigured()) return "s3";
	return null;
}

export function isObjectStorageConfigured(): boolean {
	return getStorageBackend() !== null;
}

export function getStorageBucket(): string {
	const backend = getStorageBackend();
	if (backend === "supabase") {
		return process.env.SUPABASE_STORAGE_BUCKET?.trim() ?? "";
	}
	if (backend === "s3") {
		return process.env.S3_BUCKET?.trim() ?? "";
	}
	throw new Error("Storage não configurado.");
}

export function getStorageConfigurationErrorMessage(): string {
	if (isObjectStorageConfigured()) return "";
	return "Storage não configurado. Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET (ou as variáveis S3_* para providers compatíveis).";
}
