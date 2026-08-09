import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAndWaitAuthenticated } from "./helpers/login";

const EMAIL = process.env.TEST_USER_EMAIL ?? "";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "";

/**
 * Remove lançamentos de teste órfãos ("E2E Teste %") do usuário de teste.
 * Garante que execuções anteriores interrompidas não acumulem dados.
 */
async function cleanupTestTransactions() {
	const supabaseUrl = process.env.SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey || !EMAIL) return;

	const client = createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data: user } = await client
		.from("user")
		.select("id")
		.eq("email", EMAIL)
		.single();
	if (!user) return;

	const { error } = await client
		.from("lancamentos")
		.delete()
		.eq("user_id", user.id)
		.ilike("nome", "E2E Teste %");
	if (error) {
		console.warn(
			"[e2e] limpeza de lançamentos de teste falhou:",
			error.message,
		);
	}
}

/** Confirma via banco que não restam lançamentos de teste órfãos. */
async function remainingTestTransactions(): Promise<number> {
	const supabaseUrl = process.env.SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey || !EMAIL) return -1;

	const client = createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data: user } = await client
		.from("user")
		.select("id")
		.eq("email", EMAIL)
		.single();
	if (!user) return -1;

	const { count } = await client
		.from("lancamentos")
		.select("id", { count: "exact", head: true })
		.eq("user_id", user.id)
		.ilike("nome", "E2E Teste %");
	return count ?? 0;
}

function todayDateInput(): string {
	const date = new Date();
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

async function collectErrors(page: Page) {
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		// Avisos de HTML inválido (button aninhado) — pré-existentes no PayerTag,
		// não afetam o fluxo testado.
		if (
			message.text().includes("cannot contain a nested") ||
			message.text().includes("cannot be a descendant")
		) {
			return;
		}
		errors.push(`[console.error] ${message.text()}`);
	});
	page.on("pageerror", (error) => {
		errors.push(`[pageerror] ${error.message}`);
	});
	page.on("requestfailed", (request) => {
		errors.push(
			`[requestfailed] ${request.method()} ${request.url()} → ${
				request.failure()?.errorText ?? "unknown"
			}`,
		);
	});
	return errors;
}

test.describe("fluxo básico de lançamento", () => {
	test.skip(!EMAIL || !PASSWORD, "TEST_USER_EMAIL/TEST_USER_PASSWORD ausentes");

	test.beforeEach(async () => {
		await cleanupTestTransactions();
	});

	test("login, cria despesa e apaga", async ({ page }) => {
		const errors = await collectErrors(page);

		// 1. Login (com retry para tolerar rate limit do Supabase Auth)
		await loginAndWaitAuthenticated(page);

		// 2. Navegar para lançamentos
		await page.goto("/transactions");
		await expect(
			page.getByRole("heading", { name: "Lançamentos" }),
		).toBeVisible({ timeout: 20_000 });

		// 3. Abrir dialog de nova despesa
		await page.getByRole("button", { name: "Nova Despesa" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();

		const uniqueName = `E2E Teste ${Date.now()}`;

		// 4. Preencher descrição
		await dialog.getByLabel("Descrição").fill(uniqueName);

		// 5. Data (hoje)
		await dialog.getByLabel("Data").fill(todayDateInput());

		// 6. Valor — CurrencyInput: dígitos → decimal (5000 = R$ 50,00)
		await dialog.getByLabel("Valor").fill("5000");

		// 7. Categoria (combobox com busca)
		await dialog.locator("#categoria").click();
		const categoryItem = page
			.locator('[data-slot="command-item"]')
			.filter({ hasText: "Mercado" })
			.first();
		await categoryItem.waitFor({ state: "visible" });
		await categoryItem.click();
		await expect(dialog.locator("#categoria")).toContainText("Mercado");

		// 8. Forma de pagamento: Pix
		await dialog.locator("#paymentMethod").click();
		await page.getByRole("option", { name: "Pix" }).click();

		// 9. Conta (obrigatória para Pix) — seleciona a primeira opção
		await dialog.locator("#conta").click();
		await page.getByRole("option").first().click();

		// 10. Salvar
		await dialog.getByRole("button", { name: "Salvar" }).click();
		await expect(dialog).not.toBeVisible({ timeout: 20_000 });

		// 11. Recarregar para refletir o lançamento criado (revalidação do RSC)
		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Lançamentos" }),
		).toBeVisible({ timeout: 20_000 });

		// 12. Verificar que o lançamento apareceu na tabela
		const row = page.getByRole("row").filter({ hasText: uniqueName });
		await expect(row.first()).toBeVisible({ timeout: 20_000 });

		// 13. Apagar o lançamento
		await row
			.first()
			.getByRole("button", { name: "Abrir ações do lançamento" })
			.click();
		await page.getByRole("menuitem", { name: "Remover" }).click();

		// Dialog de confirmação
		const confirmDialog = page.getByRole("alertdialog");
		await expect(confirmDialog).toBeVisible();
		await confirmDialog.getByRole("button", { name: "Remover" }).click();

		// 14. Verificar que o lançamento sumiu da tabela
		await expect(
			page.getByRole("row").filter({ hasText: uniqueName }),
		).toHaveCount(0, { timeout: 20_000 });

		// 15. Confirmar via banco que não restaram órfãos
		await expect
			.poll(async () => remainingTestTransactions(), {
				timeout: 20_000,
				message: "restaram lançamentos de teste órfãos no banco",
			})
			.toBe(0);

		// 16. Nenhum erro de console/página no fluxo
		expect(errors).toEqual([]);
	});
});
