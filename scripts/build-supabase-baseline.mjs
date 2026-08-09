#!/usr/bin/env node
/**
 * Concatena migrations Drizzle em ordem para baseline Supabase.
 * Uso: node scripts/build-supabase-baseline.mjs > supabase/migrations/00000000000000_drizzle_baseline.sql
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const drizzleDir = join(process.cwd(), "drizzle");
const journal = JSON.parse(
	readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8"),
);

const tags = journal.entries.map((e) => e.tag);
const files = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql"));

const ordered = tags
	.map((tag) => files.find((f) => f.startsWith(tag)))
	.filter(Boolean);

for (const file of ordered) {
	console.log(`-- >>> ${file}`);
	console.log(readFileSync(join(drizzleDir, file), "utf8"));
	console.log("");
}
