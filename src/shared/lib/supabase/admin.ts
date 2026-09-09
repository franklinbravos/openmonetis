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

/**
 * Teto de requisições simultâneas ao PostgREST.
 *
 * Medido contra o Supabase real: até 10 conexões TLS novas ao mesmo tempo
 * passam sempre; a partir de 20 começam a falhar handshakes (curl devolve
 * `CURLE_SSL_CONNECT_ERROR`, e o `fetch` do Node devolve erro **sem corpo** —
 * é dele que vinha o `[bridge] count falhou {}` que derrubava a página de
 * Lançamentos inteira no error boundary).
 *
 * Uma página que dispara várias consultas em paralelo estourava esse teto. Com
 * a fila, o pico de conexões novas fica baixo e o undici reaproveita as que já
 * estão abertas, em vez de refazer o handshake a cada consulta.
 */
const MAX_CONCURRENT_SUPABASE_REQUESTS = 8;

/**
 * `fetch` com fila: no máximo `limit` requisições em voo, o resto espera.
 *
 * A liberação passa a vaga direto para quem está na fila em vez de decrementar
 * e reincrementar — assim o contador nunca abre uma brecha por onde entrariam
 * duas requisições no lugar de uma.
 */
export function createQueuedFetch(limit: number): typeof fetch {
	let active = 0;
	const waiting: Array<() => void> = [];

	const acquire = (): Promise<void> => {
		if (active < limit) {
			active += 1;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			waiting.push(resolve);
		});
	};

	const release = () => {
		const next = waiting.shift();
		if (next) {
			next();
			return;
		}
		active -= 1;
	};

	return async (input, init) => {
		await acquire();
		try {
			return await fetch(input, init);
		} finally {
			release();
		}
	};
}

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
			global: {
				fetch: createQueuedFetch(MAX_CONCURRENT_SUPABASE_REQUESTS),
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
