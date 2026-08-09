import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

function required(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Variável ausente: ${name}`);
	}
	return value;
}

function getBackend() {
	if (
		process.env.SUPABASE_URL?.trim() &&
		process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
		process.env.SUPABASE_STORAGE_BUCKET?.trim()
	) {
		return "supabase";
	}
	if (
		process.env.S3_ENDPOINT?.trim() &&
		process.env.S3_ACCESS_KEY_ID?.trim() &&
		process.env.S3_SECRET_ACCESS_KEY?.trim() &&
		process.env.S3_BUCKET?.trim()
	) {
		return "s3";
	}
	return null;
}

async function testSupabase() {
	const url = required("SUPABASE_URL");
	const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
	const bucket = required("SUPABASE_STORAGE_BUCKET");
	const testKey = `__healthcheck__/openmonetis-${Date.now()}.txt`;
	const testBody = "openmonetis storage ok";

	console.log("Testando Supabase Storage...");
	console.log(`  url:    ${url}`);
	console.log(`  bucket: ${bucket}`);

	const supabase = createClient(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});

	const { data: buckets, error: listError } = await supabase.storage.listBuckets();
	if (listError) throw listError;

	if (!buckets?.some((entry) => entry.name === bucket)) {
		const { error: createError } = await supabase.storage.createBucket(bucket, {
			public: false,
			fileSizeLimit: 50 * 1024 * 1024,
		});
		if (createError && !createError.message.toLowerCase().includes("already exists")) {
			throw createError;
		}
		console.log(`✓ bucket "${bucket}" pronto`);
	}

	const { error: uploadError } = await supabase.storage
		.from(bucket)
		.upload(testKey, testBody, {
			contentType: "text/plain",
			upsert: true,
		});
	if (uploadError) throw uploadError;
	console.log("✓ upload");

	const { data: download, error: downloadError } = await supabase.storage
		.from(bucket)
		.download(testKey);
	if (downloadError) throw downloadError;
	const content = await download.text();
	if (content !== testBody) {
		throw new Error("Conteúdo lido difere do enviado");
	}
	console.log("✓ download");

	const { data: signed, error: signedError } = await supabase.storage
		.from(bucket)
		.createSignedUrl(testKey, 60);
	if (signedError) throw signedError;
	if (!signed?.signedUrl) {
		throw new Error("URL assinada não gerada");
	}
	console.log("✓ signed url");

	const { error: removeError } = await supabase.storage
		.from(bucket)
		.remove([testKey]);
	if (removeError) throw removeError;
	console.log("✓ remove");

	console.log("\nSupabase Storage configurado e funcionando.");
}

async function testS3() {
	const { S3Client, PutObjectCommand, GetObjectCommand } = await import(
		"@aws-sdk/client-s3"
	);

	const bucket = required("S3_BUCKET");
	const s3 = new S3Client({
		endpoint: required("S3_ENDPOINT"),
		region: process.env.S3_REGION?.trim() || "us-east-1",
		credentials: {
			accessKeyId: required("S3_ACCESS_KEY_ID"),
			secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
		},
		forcePathStyle: true,
	});

	const testKey = `__healthcheck__/openmonetis-${Date.now()}.txt`;
	const testBody = "openmonetis storage ok";

	console.log("Testando S3 compatível...");
	console.log(`  endpoint: ${process.env.S3_ENDPOINT}`);
	console.log(`  bucket:   ${bucket}`);

	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: testKey,
			Body: testBody,
			ContentType: "text/plain",
		}),
	);
	console.log("✓ PutObject");

	const get = await s3.send(
		new GetObjectCommand({
			Bucket: bucket,
			Key: testKey,
		}),
	);
	const content = await get.Body?.transformToString();
	if (content !== testBody) {
		throw new Error("Conteúdo lido difere do enviado");
	}
	console.log("✓ GetObject");

	console.log("\nS3 configurado e funcionando.");
}

async function main() {
	const backend = getBackend();
	if (!backend) {
		throw new Error(
			"Configure Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET) ou S3_* no .env.",
		);
	}

	if (backend === "supabase") {
		await testSupabase();
		return;
	}

	await testS3();
}

main().catch((error) => {
	console.error("\n✗ Falha no teste de storage:");
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
