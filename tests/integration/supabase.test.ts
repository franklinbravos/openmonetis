import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories } from "@/db/schema";
import type { Database } from "@/shared/lib/supabase/database.types";
import { createSupabaseDb } from "@/shared/lib/supabase/drizzle-bridge";
import {
	getSupabaseServiceRoleKey,
	getSupabaseUrl,
} from "@/shared/lib/supabase/env";

/**
 * Testes de integração usam o Supabase configurado no .env (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY). O client service_role ignora RLS, então os dados
 * são criados com um userId de teste isolado ("test-user") e removidos em
 * afterAll — nunca tocam dados de usuários reais.
 *
 * Se o Supabase não estiver configurado, a suíte é pulada (describe.skipIf).
 */

const hasSupabase = Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());

function createTestClient(): SupabaseClient<Database> {
	return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

const TEST_USER_ID = "test-user";
const TEST_USER_EMAIL = "test-user@openmonetis.local";

/**
 * Remove os dados de domínio do usuário de teste (em ordem de dependência).
 */
async function cleanUserData(client: SupabaseClient<Database>) {
	const tables = [
		"lancamentos",
		"faturas",
		"orcamentos",
		"antecipacoes_parcelas",
		"reconciliacao_linhas",
		"reconciliacao_sessoes",
		"reconciliacao_aliases",
		"pre_lancamentos",
		"anotacoes",
		"cartoes",
		"contas",
		"categorias",
		"pagadores",
		"tokens_api",
		"preferencias_usuario",
	];
	for (const table of tables) {
		const { error } = await client
			.from(table as keyof Database["public"]["Tables"])
			.delete()
			.eq("user_id", TEST_USER_ID);
		if (error && error.code !== "PGRST116") {
			console.error(`[test] falha ao limpar ${table}:`, error.message);
		}
	}
}

async function createTestUser(client: SupabaseClient<Database>) {
	const { error } = await client.from("user").insert({
		id: TEST_USER_ID,
		name: "Test User",
		email: TEST_USER_EMAIL,
		emailVerified: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
	if (error && error.code !== "23505") {
		throw error;
	}
}

async function deleteTestUser(client: SupabaseClient<Database>) {
	const { error } = await client.from("user").delete().eq("id", TEST_USER_ID);
	if (error) {
		console.error("[test] falha ao remover usuário:", error.message);
	}
}

describe.skipIf(!hasSupabase)("integração Supabase (bridge Drizzle)", () => {
	let client: SupabaseClient<Database>;
	let db: ReturnType<typeof createSupabaseDb>;

	beforeAll(async () => {
		client = createTestClient();
		db = createSupabaseDb(client);
		await cleanUserData(client);
		await createTestUser(client);
	});

	afterAll(async () => {
		await cleanUserData(client);
		await deleteTestUser(client);
	});

	it("cria e lê uma categoria via bridge", async () => {
		const categoryName = `categoria-teste-${Date.now()}`;
		await db
			.insert(categories)
			.values({
				name: categoryName,
				type: "despesa",
				icon: "tag",
				sortOrder: 0,
				userId: TEST_USER_ID,
			})
			.execute();

		const rows = await db.query.categories.findMany({
			where: eq(categories.name, categoryName),
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.name).toBe(categoryName);
		expect(rows[0]?.userId).toBe(TEST_USER_ID);
	});

	it("retorna vazio para usuário sem dados (isolamento por userId)", async () => {
		const rows = await db.query.categories.findMany({
			where: eq(categories.userId, "outro-usuario"),
		});
		expect(rows).toHaveLength(0);
	});
});
