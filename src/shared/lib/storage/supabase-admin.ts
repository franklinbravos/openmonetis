import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
	getStorageBackend,
	getStorageBucket,
} from "@/shared/lib/storage/config";

let adminClient: SupabaseClient | null = null;
let bucketEnsured = false;

export function getSupabaseAdmin(): SupabaseClient {
	if (adminClient) return adminClient;

	const url = process.env.SUPABASE_URL?.trim();
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

	if (!url || !serviceRoleKey) {
		throw new Error(
			"SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para o storage Supabase.",
		);
	}

	adminClient = createClient(url, serviceRoleKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
	});

	return adminClient;
}

/** Cria o bucket privado no Supabase se ainda não existir (service_role). */
export async function ensureSupabaseStorageBucket(): Promise<void> {
	if (getStorageBackend() !== "supabase" || bucketEnsured) return;

	const bucket = getStorageBucket();
	const supabase = getSupabaseAdmin();

	const { data: buckets, error: listError } =
		await supabase.storage.listBuckets();
	if (listError) throw listError;

	if (buckets?.some((entry) => entry.name === bucket)) {
		bucketEnsured = true;
		return;
	}

	const { error: createError } = await supabase.storage.createBucket(bucket, {
		public: false,
		fileSizeLimit: 50 * 1024 * 1024,
	});

	if (createError) {
		const message = createError.message.toLowerCase();
		if (!message.includes("already exists")) {
			throw createError;
		}
	}

	bucketEnsured = true;
}
