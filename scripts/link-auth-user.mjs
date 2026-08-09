#!/usr/bin/env node
/**
 * Vincula dados legados (public.user / Better Auth) a um usuário Supabase Auth pelo e-mail.
 *
 * Uso:
 *   node --env-file=.env scripts/link-auth-user.mjs eu@franklinbravos.com
 *   node --env-file=.env scripts/link-auth-user.mjs eu@franklinbravos.com --dry-run
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const dryRun = process.argv.includes("--dry-run");

if (!email) {
	console.error("Uso: node --env-file=.env scripts/link-auth-user.mjs <email> [--dry-run]");
	process.exit(1);
}

const url = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
	console.error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
	process.exit(1);
}

const supabase = createClient(url, serviceKey, {
	auth: { autoRefreshToken: false, persistSession: false },
});

const USER_ID_TABLES = [
	{ table: "preferencias_usuario", column: "user_id" },
	{ table: "contas", column: "user_id" },
	{ table: "categorias", column: "user_id" },
	{ table: "pagadores", column: "user_id" },
	{ table: "cartoes", column: "user_id" },
	{ table: "faturas", column: "user_id" },
	{ table: "orcamentos", column: "user_id" },
	{ table: "anotacoes", column: "user_id" },
	{ table: "insights_salvos", column: "user_id" },
	{ table: "tokens_api", column: "user_id" },
	{ table: "pre_lancamentos", column: "user_id" },
	{ table: "dashboard_notification_states", column: "user_id" },
	{ table: "antecipacoes_parcelas", column: "user_id" },
	{ table: "lancamentos", column: "user_id" },
	{ table: "anexos", column: "user_id" },
	{ table: "import_batches", column: "user_id" },
	{ table: "import_category_mappings", column: "user_id" },
	{ table: "reconciliacao_sessoes", column: "user_id" },
	{ table: "reconciliacao_linhas", column: "user_id" },
	{ table: "reconciliacao_aliases", column: "user_id" },
	{ table: "establishment_logos", column: "user_id" },
];

const USER_REF_TABLES = [
	{
		table: "compartilhamentos_pagador",
		columns: ["shared_with_user_id", "created_by_user_id"],
	},
	{ table: "convites_pagador", columns: ["created_by_user_id"] },
];

async function countRows(table, column, value) {
	const { count, error } = await supabase
		.from(table)
		.select("*", { count: "exact", head: true })
		.eq(column, value);
	if (error) throw new Error(`${table}: ${error.message}`);
	return count ?? 0;
}

async function updateRows(table, column, fromId, toId) {
	const before = await countRows(table, column, fromId);
	if (before === 0) return 0;

	const { error } = await supabase
		.from(table)
		.update({ [column]: toId })
		.eq(column, fromId);
	if (error) throw new Error(`${table}.${column}: ${error.message}`);
	return before;
}

async function main() {
	const { data: authList, error: authError } =
		await supabase.auth.admin.listUsers({ perPage: 1000 });
	if (authError) throw authError;

	const authUser = authList.users.find(
		(user) => user.email?.toLowerCase() === email,
	);
	if (!authUser) {
		console.error(`Nenhum usuário em auth.users com e-mail ${email}`);
		process.exit(1);
	}

	const newId = authUser.id;
	const { data: publicUsers, error: publicError } = await supabase
		.from("user")
		.select("*")
		.ilike("email", email);
	if (publicError) throw publicError;

	let legacyUser = publicUsers?.find((row) => row.id !== newId);
	const existingNewUser = publicUsers?.find((row) => row.id === newId);

	if (!legacyUser && existingNewUser) {
		const { data: migrationUsers, error: migrationError } = await supabase
			.from("user")
			.select("*")
			.like("email", "legacy-%@migration.local");
		if (migrationError) throw migrationError;

		for (const row of migrationUsers ?? []) {
			const oldId = row.email?.match(/^legacy-(.+)@migration\.local$/)?.[1];
			if (!oldId) continue;

			let orphanRows = 0;
			for (const { table, column } of USER_ID_TABLES) {
				orphanRows += await countRows(table, column, oldId);
			}
			if (orphanRows > 0) {
				legacyUser = row;
				break;
			}
		}
	}

	console.log(`Auth user:  ${newId} (${authUser.email})`);
	console.log(`Legacy user: ${legacyUser?.id ?? "(nenhum)"}`);
	console.log(`New public.user já existe: ${Boolean(existingNewUser)}`);

	if (!legacyUser) {
		if (existingNewUser) {
			console.log("Nada a migrar — dados já estão no ID do Supabase Auth.");
			return;
		}
		if (!dryRun) {
			const now = new Date().toISOString();
			const { error } = await supabase.from("user").insert({
				id: newId,
				name:
					authUser.user_metadata?.name ??
					authUser.email?.split("@")[0] ??
					"Usuário",
				email: authUser.email,
				emailVerified: Boolean(authUser.email_confirmed_at),
				must_change_password: false,
				image: authUser.user_metadata?.avatar_url ?? null,
				createdAt: authUser.created_at ?? now,
				updatedAt: now,
			});
			if (error) throw error;
		}
		console.log("Concluído.");
		return;
	}

	if (legacyUser.id === newId) {
		console.log("IDs já coincidem — nada a fazer.");
		return;
	}

	const oldId = legacyUser.id;
	console.log(`\nMigrando ${oldId} → ${newId}${dryRun ? " (dry-run)" : ""}:\n`);

	const mergedUser = {
		id: newId,
		name: legacyUser.name ?? authUser.user_metadata?.name ?? "Usuário",
		email: authUser.email ?? legacyUser.email,
		emailVerified: Boolean(authUser.email_confirmed_at ?? legacyUser.emailVerified),
		must_change_password: legacyUser.must_change_password ?? false,
		image: legacyUser.image ?? authUser.user_metadata?.avatar_url ?? null,
		createdAt: legacyUser.createdAt ?? authUser.created_at,
		updatedAt: new Date().toISOString(),
	};

	console.log("  public.user: garantir registro com novo ID (antes das FKs)");
	if (!dryRun) {
		if (!existingNewUser) {
			const { error: emailBumpError } = await supabase
				.from("user")
				.update({
					email: `legacy-${oldId}@migration.local`,
					updatedAt: new Date().toISOString(),
				})
				.eq("id", oldId);
			if (emailBumpError) throw emailBumpError;
		}

		const { error: upsertError } = await supabase
			.from("user")
			.upsert(mergedUser, { onConflict: "id" });
		if (upsertError) throw upsertError;
	}

	for (const { table, column } of USER_ID_TABLES) {
		const rows = await countRows(table, column, oldId);
		if (rows > 0) {
			console.log(`  ${table}.${column}: ${rows} linha(s)`);
			if (!dryRun) await updateRows(table, column, oldId, newId);
		}
	}

	for (const { table, columns } of USER_REF_TABLES) {
		for (const column of columns) {
			const rows = await countRows(table, column, oldId);
			if (rows > 0) {
				console.log(`  ${table}.${column}: ${rows} linha(s)`);
				if (!dryRun) await updateRows(table, column, oldId, newId);
			}
		}
	}

	console.log("\n  public.user: remover registro legado");
	if (!dryRun) {
		const { error: deleteError } = await supabase
			.from("user")
			.delete()
			.eq("id", oldId);
		if (deleteError) throw deleteError;
	}

	console.log(dryRun ? "\nDry-run concluído." : "\nMigração concluída com sucesso.");
}

main().catch((error) => {
	console.error("Erro:", error.message ?? error);
	process.exit(1);
});
