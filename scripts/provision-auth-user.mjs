#!/usr/bin/env node
/**
 * Cria usuário no Supabase Auth + public.user + seeds iniciais.
 * Se existir legado com o mesmo e-mail, migra os dados automaticamente.
 *
 * Uso:
 *   node --env-file=.env scripts/provision-auth-user.mjs <email> <senha> [nome]
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];
const name = process.argv[4]?.trim();

if (!email || !password) {
	console.error(
		"Uso: node --env-file=.env scripts/provision-auth-user.mjs <email> <senha> [nome]",
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

const DEFAULT_CATEGORIES = [
	["Alimentação", "despesa", "RiRestaurant2Line"],
	["Transporte", "despesa", "RiBusLine"],
	["Moradia", "despesa", "RiHomeLine"],
	["Saúde", "despesa", "RiStethoscopeLine"],
	["Educação", "despesa", "RiBook2Line"],
	["Lazer", "despesa", "RiGamepadLine"],
	["Compras", "despesa", "RiShoppingBagLine"],
	["Assinaturas", "despesa", "RiServiceLine"],
	["Pets", "despesa", "RiBearSmileLine"],
	["Mercado", "despesa", "RiShoppingBasketLine"],
	["Restaurantes", "despesa", "RiRestaurantLine"],
	["Delivery", "despesa", "RiMotorbikeLine"],
	["Energia e água", "despesa", "RiFlashlightLine"],
	["Internet", "despesa", "RiWifiLine"],
	["Vestuário", "despesa", "RiTShirtLine"],
	["Viagem", "despesa", "RiFlightTakeoffLine"],
	["Presentes", "despesa", "RiGiftLine"],
	["Pagamentos", "despesa", "RiBillLine"],
	["Outras despesas", "despesa", "RiMore2Line"],
	["Salário", "receita", "RiWallet3Line"],
	["Freelance", "receita", "RiUserStarLine"],
	["Rendimentos", "receita", "RiFundsLine"],
	["Investimentos", "receita", "RiStockLine"],
	["Vendas", "receita", "RiShoppingCartLine"],
	["Prêmios", "receita", "RiMedalLine"],
	["Reembolso", "receita", "RiRefundLine"],
	["Aluguel recebido", "receita", "RiBuilding2Line"],
	["Outras receitas", "receita", "RiMore2Line"],
	["Saldo inicial", "receita", "RiWallet2Line"],
	["Transferência interna", "receita", "RiArrowLeftRightLine"],
];

function generateShareCode() {
	return randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
}

async function ensurePublicUser(authUser, displayName) {
	const now = new Date().toISOString();
	const row = {
		id: authUser.id,
		name:
			displayName ??
			authUser.user_metadata?.name ??
			authUser.email?.split("@")[0] ??
			"Usuário",
		email: authUser.email,
		emailVerified: Boolean(authUser.email_confirmed_at),
		must_change_password: false,
		image: authUser.user_metadata?.avatar_url ?? null,
		createdAt: authUser.created_at ?? now,
		updatedAt: now,
	};

	const { error } = await supabase.from("user").upsert(row, { onConflict: "id" });
	if (error) throw error;
}

async function seedDefaults(userId, userName, userEmail) {
	const { count: categoryCount } = await supabase
		.from("categorias")
		.select("*", { count: "exact", head: true })
		.eq("user_id", userId);

	if ((categoryCount ?? 0) === 0) {
		const rows = DEFAULT_CATEGORIES.map(([nome, tipo, icone]) => ({
			nome,
			tipo,
			icone,
			user_id: userId,
			ordem: 0,
		}));
		const { error } = await supabase.from("categorias").insert(rows);
		if (error) throw new Error(`seed categorias: ${error.message}`);
		console.log(`  categorias padrão: ${rows.length}`);
	}

	const { count: payerCount } = await supabase
		.from("pagadores")
		.select("*", { count: "exact", head: true })
		.eq("user_id", userId);

	if ((payerCount ?? 0) === 0) {
		const { error } = await supabase.from("pagadores").insert({
			user_id: userId,
			nome: userName,
			email: userEmail,
			status: "ativo",
			role: "admin",
			avatar_url: "/default-avatar.png",
			is_auto_send: false,
			share_code: generateShareCode(),
		});
		if (error) throw new Error(`seed pagador: ${error.message}`);
		console.log("  pagador admin criado");
	}
}

async function main() {
	const { data: list, error: listError } = await supabase.auth.admin.listUsers({
		perPage: 1000,
	});
	if (listError) throw listError;

	let authUser = list.users.find((user) => user.email?.toLowerCase() === email);

	if (!authUser) {
		console.log(`Criando auth.users: ${email}`);
		const { data, error } = await supabase.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
			user_metadata: name ? { name } : undefined,
		});
		if (error) throw error;
		authUser = data.user;
	} else {
		console.log(`Usuário já existe em auth.users: ${authUser.id}`);
		const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
			password,
			email_confirm: true,
			user_metadata: name ? { name } : authUser.user_metadata,
		});
		if (error) throw error;
	}

	const displayName = name ?? authUser.user_metadata?.name ?? email.split("@")[0];
	await ensurePublicUser(authUser, displayName);

	const link = spawnSync(
		process.execPath,
		["--env-file=.env", "scripts/link-auth-user.mjs", email],
		{ cwd: process.cwd(), stdio: "inherit", env: process.env },
	);
	if (link.status !== 0) {
		process.exit(link.status ?? 1);
	}

	console.log("Seeds iniciais:");
	await seedDefaults(authUser.id, displayName, email);
	console.log(`\nUsuário pronto: ${email} (${authUser.id})`);
}

main().catch((error) => {
	console.error("Erro:", error.message ?? error);
	process.exit(1);
});
