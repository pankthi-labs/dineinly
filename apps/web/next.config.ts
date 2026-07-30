import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// The monorepo's single .env lives at the repo root (shared with
// packages/db's drizzle.config.ts and the Supabase CLI) — outside
// apps/web, where Next.js looks by default. Load it explicitly; CI sets
// real env vars directly and has no .env file, which is fine — this never
// overrides an already-set process.env value. See
// https://nextjs.org/docs/messages/env-loading (monorepo env loading).
// forceReload (4th arg) is required: Next.js already calls loadEnvConfig
// once internally, pointed at this directory (finding nothing, since the
// root .env lives one level up) — without forcing a reload, @next/env's
// own module-level cache just replays that empty result and this call is
// a no-op.
loadEnvConfig(
	path.resolve(import.meta.dirname, "../.."),
	process.env.NODE_ENV !== "production",
	console,
	true,
);

const nextConfig: NextConfig = {
	transpilePackages: ["@workspace/ui", "@workspace/db"],
};

export default nextConfig;
