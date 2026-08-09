import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
	getStorageBackend,
	getStorageBucket,
} from "@/shared/lib/storage/config";
import type { Database } from "@/shared/lib/supabase/database.types";
import {
	getSupabaseServiceRoleKey,
	getSupabaseUrl,
} from "@/shared/lib/supabase/env";

let adminClient: SupabaseClient<Database> | null = null;
let bucketEnsured = false;

export function getSupabaseAdmin(): SupabaseClient<Database> {
	if (adminClient) return adminClient;

	adminClient = createClient<Database>(
		getSupabaseUrl(),
		getSupabaseServiceRoleKey(),
		{
			auth: {
				persistSession: false,
				autoRefreshToken: false,
			},
		},
	);

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
