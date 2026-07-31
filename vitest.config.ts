import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// vitest doesn't read tsconfig paths, so mirror apps/web's "@/*" here.
		// No other workspace uses "@", so this is unambiguous.
		alias: { "@": path.resolve(__dirname, "apps/web") },
	},
	test: {
		environment: "node",
		include: [
			"apps/*/tests/**/*.test.{ts,tsx}",
			"packages/*/tests/**/*.test.{ts,tsx}",
		],
		exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
		setupFiles: ["./vitest.setup.ts"],
	},
});
