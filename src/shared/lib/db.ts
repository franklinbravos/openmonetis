import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { createSupabaseDb } from "@/shared/lib/supabase/drizzle-bridge";

const globalForDb = globalThis as unknown as {
	db?: ReturnType<typeof createSupabaseDb>;
};

function getDb() {
	const cached = globalForDb.db;
	if (!cached || typeof cached.selectDistinct !== "function") {
		globalForDb.db = createSupabaseDb();
	}
	return globalForDb.db as NonNullable<typeof globalForDb.db>;
}

/**
 * Camada de dados via Supabase PostgREST (API) com API compatível ao Drizzle.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
	get(_, prop) {
		return Reflect.get(getDb(), prop);
	},
});

export { schema };
