---
name: dineinly-data
description: Safely change Dineinly's Drizzle schema, PostgreSQL migrations, Supabase RLS policies, tRPC data access, authentication, and tenant-scoped server logic. Use for database, authorization, router, migration, or schema work in the Dineinly repository.
---

# Dineinly Data

Read `AGENTS.md`, `docs/architecture.md`, and `docs/core-data-model.md` before changing data access. Read `docs/product.md` for permission or workflow changes.

## Workflow

1. Derive entities and relationships only from `docs/core-data-model.md`. Stop and ask about any listed TBD rather than filling it in.
2. Tenant-scope every query and provide RLS for every tenant-facing table. Cross-tenant access is Dineinly Admin only and must be audited.
3. Use tRPC as the only application data layer. Enforce permissions on the server.
4. Never model `auth`, `storage`, `realtime`, or other Supabase-owned schemas as Drizzle tables. Add external-schema foreign keys only in a hand-written custom migration.
5. Generate Drizzle migrations, then apply them only with the Supabase CLI. Never run `drizzle-kit migrate`, `drizzle-kit push`, or `supabase db diff`.
6. Keep guests accountless and their tokens scoped. Keep station PINs out of database authentication.

## Verification

Run the relevant typecheck, tests, and safe local Supabase validation. Inspect generated migration SQL and RLS policies for tenant isolation before handoff.
