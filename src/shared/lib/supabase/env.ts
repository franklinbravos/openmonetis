/**
 * Variáveis Supabase em runtime.
 * URL e anon key usam NEXT_PUBLIC_* no cliente (login, OAuth).
 * service_role permanece somente no servidor.
 */

function readEnv(...names: string[]): string | undefined {
	for (const name of names) {
		const value = process.env[name]?.trim();
		if (value) return value;
	}
	return undefined;
}

export function getSupabaseUrl(): string {
	const url = readEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
	if (!url) {
		throw new Error(
			"SUPABASE_URL não configurada. Defina NEXT_PUBLIC_SUPABASE_URL (e SUPABASE_URL no servidor, se quiser).",
		);
	}
	return url;
}

export function getSupabaseAnonKey(): string {
	const key = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
	if (!key) {
		throw new Error(
			"SUPABASE_ANON_KEY não configurada. Defina NEXT_PUBLIC_SUPABASE_ANON_KEY (e SUPABASE_ANON_KEY no servidor, se quiser).",
		);
	}
	return key;
}

export function getSupabaseServiceRoleKey(): string {
	const key = readEnv(
		"SUPABASE_SERVICE_ROLE_KEY",
		// alias legado (typo comum — não expor no cliente)
		"NEXT_SUPABASE_SERVICE_ROLE_KEY",
	);
	if (!key) {
		throw new Error(
			"SUPABASE_SERVICE_ROLE_KEY não configurada. Copie a service_role em Supabase → Project Settings → API (somente servidor).",
		);
	}
	return key;
}

export function isSupabaseProjectConfigured(): boolean {
	return Boolean(
		readEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL") &&
			readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY") &&
			readEnv("SUPABASE_SERVICE_ROLE_KEY", "NEXT_SUPABASE_SERVICE_ROLE_KEY"),
	);
}

export function getSupabaseProjectRef(): string | null {
	const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
	if (!supabaseUrl) return null;

	try {
		const hostname = new URL(supabaseUrl).hostname;
		return hostname.split(".")[0] ?? null;
	} catch {
		return null;
	}
}
