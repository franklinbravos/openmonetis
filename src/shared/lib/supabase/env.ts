import type { PoolConfig } from "pg";

/**
 * URLs de banco para o OpenMonetis com Supabase.
 *
 * - App (Drizzle/Better Auth): DATABASE_URL → Postgres **direct** (db.*.supabase.co:5432)
 * - Migrações (drizzle-kit push): SUPABASE_TRANSACTION_POOLER (opcional) ou DATABASE_URL
 * - Storage: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (API do Supabase — não é SQL)
 */

export function getAppDatabaseUrl(): string {
	const url = process.env.DATABASE_URL?.trim();
	if (!url) {
		throw new Error(
			"DATABASE_URL não configurada. Use a conexão direct do Supabase (db.*.supabase.co:5432).",
		);
	}
	return url;
}

/**
 * Usado só por drizzle-kit (db:push, db:studio, db:generate).
 * Em produção (Coolify) essa URL normalmente não é necessária — o app em runtime usa getAppDatabaseUrl().
 */
export function getMigrationDatabaseUrl(): string {
	const url =
		process.env.SUPABASE_MIGRATION_DATABASE_URL?.trim() ??
		process.env.SUPABASE_TRANSACTION_POOLER?.trim() ??
		process.env.DATABASE_URL?.trim();

	if (!url) {
		throw new Error(
			"Defina DATABASE_URL ou SUPABASE_TRANSACTION_POOLER para drizzle-kit.",
		);
	}

	return url;
}

/** Config do `pg.Pool` — trata SSL do Supabase no driver Node.js. */
export function getPgPoolConfig(): PoolConfig {
	const raw = getAppDatabaseUrl();
	const isSupabase = raw.includes("supabase.co");

	if (!isSupabase) {
		return { connectionString: raw };
	}

	// sslmode=require na URL faz o pg v8+ validar certificado (verify-full).
	// Removemos da string e usamos ssl explícito compatível com Supabase.
	const url = new URL(raw);
	url.searchParams.delete("sslmode");

	return {
		connectionString: url.toString(),
		ssl: { rejectUnauthorized: false },
	};
}

export function isSupabaseProjectConfigured(): boolean {
	return Boolean(
		process.env.SUPABASE_URL?.trim() &&
			process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
	);
}

export function getSupabaseProjectRef(): string | null {
	const url = process.env.SUPABASE_URL?.trim();
	if (!url) return null;

	try {
		const hostname = new URL(url).hostname;
		return hostname.split(".")[0] ?? null;
	} catch {
		return null;
	}
}

/**
 * Monta URL direct a partir do project ref + senha (útil no setup inicial).
 */
export function buildSupabaseDirectDatabaseUrl(
	projectRef: string,
	password: string,
): string {
	const encodedPassword = encodeURIComponent(password);
	return `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
}
