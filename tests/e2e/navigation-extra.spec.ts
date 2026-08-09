import { expect, type Page, test } from "@playwright/test";
import { loginAndWaitAuthenticated } from "./helpers/login";

const EMAIL = process.env.TEST_USER_EMAIL ?? "";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? "";

test.describe("navegação rotas extras (importação/reconciliação)", () => {
	test.skip(!EMAIL || !PASSWORD, "TEST_USER_EMAIL/TEST_USER_PASSWORD ausentes");

	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		await loginAndWaitAuthenticated(page);
	});

	test.afterAll(async () => {
		await page?.close();
	});

	const rotas = [
		{ path: "/transactions/import", name: "importação" },
		{ path: "/transactions/import/history", name: "histórico de importação" },
		{ path: "/reconciliation", name: "reconciliação" },
	];

	for (const { path, name } of rotas) {
		test(`rota ${name} (${path}) renderiza sem erro`, async () => {
			await page.goto(path);
			await page.waitForLoadState("networkidle");
			const body = await page.locator("body").innerText();
			expect(body).not.toContain("Algo deu errado");
			const mainText = await page.locator("main").innerText();
			expect(mainText.trim().length).toBeGreaterThan(0);
		});
	}
});
