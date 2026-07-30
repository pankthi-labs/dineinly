import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

if (!process.env.DATABASE_URL) {
	throw new Error(
		"DATABASE_URL is not set — add it to the monorepo root .env file.",
	);
}

export default defineConfig({
	schema: "./src/schema/index.ts",
	// Drizzle authors migrations, Supabase CLI applies them — one history,
	// one folder. See AGENTS.md guardrails: never run drizzle-kit migrate/push.
	out: "../../supabase/migrations",
	dialect: "postgresql",
	migrations: {
		prefix: "supabase",
	},
	dbCredentials: {
		url: process.env.DATABASE_URL,
	},
});
