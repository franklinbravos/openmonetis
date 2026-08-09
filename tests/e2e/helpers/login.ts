import type { Page } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL ?? "";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "";

/**
 * Faz login e aguarda chegar a uma rota autenticada (dashboard/transactions).
 * Tenta até 3x para tolerar rate limit do Supabase Auth (5/min por usuário)
 * e compilação lenta do dev server na primeira carga.
 */
export async function loginAndWaitAuthenticated(page: Page): Promise<void> {
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		await page.goto("/login");
		await page.getByLabel("E-mail").fill(EMAIL);
		await page.getByLabel("Senha").fill(PASSWORD);
		await page.getByRole("button", { name: "Entrar" }).click();

		const autenticado = await page
			.waitForURL(/\/dashboard|\/transactions/, { timeout: 25_000 })
			.then(() => true)
			.catch(() => false);
		if (autenticado) return;

		// Pequena espera antes de tentar de novo (rate limit).
		await page.waitForTimeout(2_000);
	}

	throw new Error("Não foi possível autenticar após 3 tentativas.");
}
