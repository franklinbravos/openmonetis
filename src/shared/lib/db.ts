import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import {
	createSupabaseDb,
	DRIZZLE_BRIDGE_VERSION,
} from "@/shared/lib/supabase/drizzle-bridge";

const globalForDb = globalThis as unknown as {
	db?: ReturnType<typeof createSupabaseDb>;
	bridgeVersion?: number;
};

function getDb() {
	const cached = globalForDb.db;
	const bridgeStale =
		globalForDb.bridgeVersion !== DRIZZLE_BRIDGE_VERSION ||
		!cached ||
		typeof cached.selectDistinct !== "function";

	if (bridgeStale) {
		globalForDb.db = createSupabaseDb();
		globalForDb.bridgeVersion = DRIZZLE_BRIDGE_VERSION;
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
