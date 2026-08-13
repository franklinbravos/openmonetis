#!/usr/bin/env node
/**
 * Vincula um usuário existente ao ambiente familiar (share edit no admin payer).
 *
 * Uso:
 *   node --env-file=.env scripts/sync-family-access.mjs gi.gergollete@gmail.com
 *   node --env-file=.env scripts/sync-family-access.mjs gi.gergollete@gmail.com --dry-run
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const dryRun = process.argv.includes("--dry-run");

if (!email) {
	console.error(
		"Uso: node --env-file=.env scripts/sync-family-access.mjs <email> [--dry-run]",
	);
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

const { data: targetUser, error: userError } = await supabase
	.from("user")
	.select("id, name, email")
	.eq("email", email)
	.maybeSingle();

if (userError) {
	console.error("Erro ao buscar usuário:", userError.message);
	process.exit(1);
}

if (!targetUser) {
	console.error(`Usuário não encontrado para o e-mail ${email}`);
	process.exit(1);
}

const { data: familyAdmin, error: adminError } = await supabase
	.from("pagadores")
	.select("id, user_id, name")
	.eq("role", "admin")
	.order("created_at", { ascending: true })
	.limit(1)
	.maybeSingle();

if (adminError) {
	console.error("Erro ao buscar admin familiar:", adminError.message);
	process.exit(1);
}

if (!familyAdmin) {
	console.error("Nenhum pagador admin encontrado nesta instância.");
	process.exit(1);
}

if (familyAdmin.user_id === targetUser.id) {
	console.log("Usuário já é o admin familiar. Nada a fazer.");
	process.exit(0);
}

const { data: existingShare } = await supabase
	.from("compartilhamentos_pagador")
	.select("id, permission")
	.eq("pagador_id", familyAdmin.id)
	.eq("shared_with_user_id", targetUser.id)
	.maybeSingle();

console.log("Admin familiar:", familyAdmin.name, `(${familyAdmin.user_id})`);
console.log("Usuário alvo:", targetUser.name, `(${targetUser.id})`);

if (existingShare) {
	console.log(`Share existente (${existingShare.permission}). Atualizando para edit...`);
	if (dryRun) {
		console.log("[dry-run] Share seria atualizado.");
		process.exit(0);
	}

	const { error: updateError } = await supabase
		.from("compartilhamentos_pagador")
		.update({ permission: "edit" })
		.eq("id", existingShare.id);

	if (updateError) {
		console.error("Erro ao atualizar share:", updateError.message);
		process.exit(1);
	}

	console.log("Share atualizado com sucesso.");
	process.exit(0);
}

if (dryRun) {
	console.log("[dry-run] Share edit seria criado.");
	process.exit(0);
}

const { error: insertError } = await supabase
	.from("compartilhamentos_pagador")
	.insert({
		pagador_id: familyAdmin.id,
		shared_with_user_id: targetUser.id,
		permission: "edit",
		created_by_user_id: familyAdmin.user_id,
	});

if (insertError) {
	console.error("Erro ao criar share:", insertError.message);
	process.exit(1);
}

console.log("Acesso familiar vinculado com sucesso (permission: edit).");
