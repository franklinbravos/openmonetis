import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config();

const appPort = process.env.APP_PORT ?? "3050";
const appUrl = `http://localhost:${appPort}`;

export default defineConfig({
	testDir: "tests/e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	// 1 worker: os specs fazem login com o mesmo usuário de teste e compartilham
	// sessão — executar em paralelo causaria competição de sessão.
	workers: 1,
	reporter: process.env.CI ? "github" : "list",
	timeout: 90_000,
	use: {
		baseURL: appUrl,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: `pnpm run dev`,
		url: appUrl,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
