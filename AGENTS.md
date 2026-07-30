# Dineinly — Agent Instructions

Dineinly is a premium, real-time, multi-tenant dine-in platform (QR ordering, kitchen workflow, billing, restaurant management). Modular monolith: Next.js + tRPC + PostgreSQL/Supabase. Full stack: `docs/tech-stack.md`.

## Read Before You Work

Do not guess business rules, permissions, tokens, or infra choices — read the governing doc first. Each is self-contained; read only the one(s) relevant to the task.

| Doc | Read before... |
|---|---|
| `docs/product.md` | product/business rules, order flow, menu, billing, RBAC, roles |
| `docs/architecture.md` | data layer, auth, RLS/tenancy, realtime, API design, idempotency |
| `docs/core-data-model.md` | entities, schema, relationships, tenancy boundaries — before any Drizzle/RLS/router work |
| `docs/realtime.md` | realtime channels, broadcast triggers, `realtime.messages` RLS, client subscriptions |
| `docs/tech-stack.md` | adding a dependency, choosing a library, infra/deploy/tooling |
| `docs/design-system.md` | any UI, styling, layout, motion, or component work |

## Always-True Guardrails

Non-negotiable regardless of which doc you're reading:

- **No payments processing** — Dineinly never handles payment transactions. Settlement = marking a bill paid externally.
- **Tenant isolation is mandatory** — every tenant-facing table has RLS; every query is tenant-scoped. Only Dineinly Admin crosses tenants, and only with audit logging.
- **Guests never have accounts** — scoped anonymous session tokens only, authorized via RLS.
- **Staff auth is role-specific**: Owners/Managers use Email OTP; Kitchen/Floor use a shared station account + app-level PIN (PIN is not a DB auth factor). No NFC/passkeys.
- **tRPC is the only data layer** — no CRUD via Server Actions, no GraphQL, no REST.
- **No UI component library** — build with semantic HTML/CSS against `docs/design-system.md` tokens only. No values (color/spacing/radius/duration/easing) outside that doc.
- **Dark-only, text-only MVP** — no light mode, no images.
- **All permissions are server-enforced** — client-side checks are UX only, never security.
- **Order mutations must be idempotent** — no duplicate orders from retries or repeated taps.
- **Migrations: Drizzle authors, Supabase CLI applies.** `drizzle-kit generate` writes to `supabase/migrations/`; `supabase db reset` / `db push` apply. Never run `drizzle-kit migrate`, `drizzle-kit push`, or `supabase db diff`, and never edit tables in Studio — each starts a second, divergent migration history. See `docs/architecture.md`.
- **Never model external Supabase schemas as Drizzle tables** (`auth`, `storage`, `realtime`, etc.) — Supabase owns their migrations. A typed `.references()` stub makes `drizzle-kit generate` treat that table as ours to manage and try to create or drop it. FKs into these schemas are a plain column plus a hand-written `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`, in a custom migration (`drizzle-kit generate --custom`), never folded into a Drizzle-generated one. See `docs/architecture.md`.

## Unresolved — Stop and Ask

Marked `TBD` in the docs — do not guess these, flag and ask:

- Tax/service/rounding formula (`docs/core-data-model.md`)
- Force-terminate session: void vs. settle handling of an open bill (`docs/core-data-model.md`, `docs/product.md`)

If a doc introduces another `TBD`, do not invent entities, schema, or relationships to fill the gap — flag it and ask instead of guessing.
