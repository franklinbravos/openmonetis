import { expect, type Page, test } from "@playwright/test";
import { loginAndWaitAuthenticated } from "./helpers/login";

const EMAIL = process.env.TEST_USER_EMAIL ?? "";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "";

test.describe("navegação completa do dashboard", () => {
	test.skip(!EMAIL || !PASSWORD, "TEST_USER_EMAIL/TEST_USER_PASSWORD ausentes");

	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		await loginAndWaitAuthenticated(page);
	});

	test.afterAll(async () => {
		await page?.close();
	});

	test("dashboard renderiza sem 'Algo deu errado'", async () => {
		await page.goto("/dashboard");
		await page.waitForLoadState("networkidle");
		await expect(page.locator("body")).not.toContainText("Algo deu errado");
	});

	const rotas = [
		{ path: "/transactions" },
		{ path: "/accounts" },
		{ path: "/cards" },
		{ path: "/categories" },
		{ path: "/budgets" },
		{ path: "/payers" },
		{ path: "/notes" },
		{ path: "/calendar" },
		{ path: "/insights" },
		{ path: "/inbox" },
		{ path: "/reports/category-trends" },
		{ path: "/reports/card-usage" },
		{ path: "/reports/installment-analysis" },
		{ path: "/reports/establishments" },
		{ path: "/attachments" },
		{ path: "/settings" },
	];

	for (const { path } of rotas) {
		test(`rota ${path} renderiza sem erro`, async () => {
			await page.goto(path);
			await page.waitForLoadState("networkidle");
			const body = await page.locator("body").innerText();
			expect(body).not.toContain("Algo deu errado");
			// main deve ter conteúdo além da navegação
			const mainText = await page.locator("main").innerText();
			expect(mainText.trim().length).toBeGreaterThan(0);
		});
	}

	test("logout retorna para /login", async () => {
		await page.goto("/dashboard");
		await page.waitForLoadState("networkidle");
		const userMenu = page.getByRole("button", { name: /menu do usuário/i });
		await userMenu.click();
		await page.getByText("Sair", { exact: true }).click();
		await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
	});
});
