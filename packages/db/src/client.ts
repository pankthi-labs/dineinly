import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

// TRUSTED SERVER-ONLY CLIENT. Connects with `DATABASE_URL`, the postgres
// superuser — it BYPASSES ROW LEVEL SECURITY entirely (see AGENTS.md:
// "Tenant isolation is mandatory"). Use this only for work that is
// inherently cross-tenant or pre-auth (migrations, seeding, admin jobs,
// internal server logic that has already tenant-scoped itself in code).
//
// Guest and staff reads/writes MUST go through the Supabase client
// (@supabase/ssr) using the anon key, inside a request context carrying the
// caller's JWT — that is what makes RLS apply. Never import this client
// into a guest- or staff-facing tRPC procedure. Import path is deliberate:
// `@workspace/db` (bare) resolves to schema only — this trusted client
// lives at the explicit `@workspace/db/client` subpath so pulling in
// schema types can never accidentally pull in RLS-bypassing DB access.
//
// Module-scoped singleton: Next.js dev HMR re-evaluates modules on every
// edit, and a fresh `postgres()` connection per reload leaks connections.
declare global {
	var __dineinlyDbClient: ReturnType<typeof postgres> | undefined;
}

const connection =
	globalThis.__dineinlyDbClient ??
	postgres(process.env.DATABASE_URL as string, { prepare: false });

if (process.env.NODE_ENV !== "production") {
	globalThis.__dineinlyDbClient = connection;
}

export const db = drizzle(connection, { schema });
