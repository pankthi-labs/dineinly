import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// The monorepo's single .env lives at the repo root (shared with
// packages/db's drizzle.config.ts and the Supabase CLI) — outside
// apps/web, where Next.js looks by default. Load it explicitly here; this
// never overrides an already-set process.env value, so CI (which sets
// real env vars directly and has no .env file) is unaffected. See
// https://nextjs.org/docs/messages/env-loading (monorepo env loading).
// forceReload (4th arg) is required: without it, @next/env's module-level
// cache would keep the empty result from the internal load Next.js already
// does for this directory, since the root .env lives one level up from it.
loadEnvConfig(
	path.resolve(import.meta.dirname, "../.."),
	process.env.NODE_ENV !== "production",
	console,
	true,
);

const nextConfig: NextConfig = {
	allowedDevOrigins: ["127.0.0.1"],
	transpilePackages: ["@workspace/ui", "@workspace/db"],
};

export default nextConfig;
