import { getMigrationDatabaseUrl } from "./src/shared/lib/supabase/env";

export default {
	schema: "./src/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: getMigrationDatabaseUrl(),
	},
} satisfies import("drizzle-kit").Config;
