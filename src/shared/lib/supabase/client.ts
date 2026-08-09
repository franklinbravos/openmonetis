import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/shared/lib/supabase/database.types";

/**
 * Acesso estático — o Next só injeta NEXT_PUBLIC_* no bundle do cliente assim.
 */
function getBrowserSupabaseConfig() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!url?.trim() || !anonKey?.trim()) {
		throw new Error(
			"Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env e reinicie o servidor (pnpm dev).",
		);
	}

	return { url: url.trim(), anonKey: anonKey.trim() };
}

export function createClient() {
	const { url, anonKey } = getBrowserSupabaseConfig();
	return createBrowserClient<Database>(url, anonKey);
}
