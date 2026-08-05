export function isObjectStorageConfigured(): boolean {
	return Boolean(
		process.env.S3_ENDPOINT?.trim() &&
			process.env.S3_ACCESS_KEY_ID?.trim() &&
			process.env.S3_SECRET_ACCESS_KEY?.trim() &&
			process.env.S3_BUCKET?.trim(),
	);
}
