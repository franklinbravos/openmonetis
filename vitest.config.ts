import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "node",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
		exclude: ["src/**/*.e2e.test.ts", "tests/e2e/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
			include: [
				"src/shared/utils/**",
				"src/shared/lib/import/**",
				"src/shared/lib/payers/**",
				"src/shared/lib/schemas/**",
			],
			exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"],
		},
	},
});
