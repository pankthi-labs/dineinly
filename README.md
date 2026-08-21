# Dineinly

Premium, real-time, multi-tenant dine-in platform (QR ordering, kitchen workflow, billing,
restaurant management). Modular monolith: Next.js + tRPC + PostgreSQL/Supabase.

See [`AGENTS.md`](./AGENTS.md) for agent/contributor instructions and the governing docs in
[`docs/`](./docs):

- [`docs/product.md`](./docs/product.md) — business rules, order flow, menu, billing, RBAC
- [`docs/architecture.md`](./docs/architecture.md) — data layer, auth, RLS/tenancy, realtime, API
- [`docs/core-data-model.md`](./docs/core-data-model.md) — entities, schema, relationships, tenancy boundaries
- [`docs/realtime.md`](./docs/realtime.md) — realtime channels, broadcast triggers, client subscriptions
- [`docs/tech-stack.md`](./docs/tech-stack.md) — dependencies, infra, tooling
- [`docs/design-system.md`](./docs/design-system.md) — UI tokens: color, type, spacing, radius, motion, breakpoints, icons, shadow, z-index

## Prerequisites

Install these before anything else:

| Tool | Version | Install |
|---|---|---|
| Node.js | pinned in `.nvmrc` | [nvm](https://github.com/nvm-sh/nvm) / [fnm](https://github.com/Schniz/fnm) recommended — both auto-switch on `.nvmrc` |
| pnpm | `11.15.1` | `corepack enable` (reads `packageManager` in `package.json`) |
| Docker | any recent | required by Supabase CLI to run local Postgres/Auth/Storage |
| Supabase CLI | pinned in `package.json` | installed by `pnpm install` — no separate install step |

## Setup from scratch

```bash
git clone <repo-url>
cd dineinly

cp .env.example .env       # DATABASE_URL already points at local Supabase; other vars below

pnpm install                # installs all workspaces (apps/web, packages/*) + pinned Supabase CLI
                             # also registers the pre-push git hook (see "Common commands")

# Generate the guest-JWT signing key (gitignored, local dev only):
supabase gen signing-key --algorithm RS256 > /tmp/key.json
echo "[$(cat /tmp/key.json)]" > supabase/signing_keys.json     # config.toml expects a JSON array
# Paste the same key (unwrapped, not the array) as GUEST_JWT_SIGNING_KEY in .env

# Generate the station-cookie HMAC secret and paste it as STATION_PIN_SECRET in .env.
# App-only (never reaches Supabase), so any high-entropy string of 32+ chars works:
openssl rand -base64 48

pnpm db:start                # boots local Postgres/Auth/Storage/Realtime via Docker
                             # first run pulls Docker images, takes a few minutes

supabase status -o env       # fill NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY in .env

pnpm db:reset                # applies every committed migration, then seeds the DB
                             # (see "Database migrations" below — never drizzle-kit push/migrate)

pnpm dev                    # turbo dev -> next dev
```

App runs at **http://127.0.0.1:3000**.

## Environment

The app (`apps/web`) validates five env vars at startup via `apps/web/lib/env.ts` (invalid or
missing fails fast, not mid-request), read from the **monorepo root** `.env`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=            # from `supabase status -o env`
SUPABASE_SERVICE_ROLE_KEY=                # from `supabase status -o env` — bypasses RLS, server-only
GUEST_JWT_SIGNING_KEY=                    # private JWK (RS256) — see "Setup from scratch" above
STATION_PIN_SECRET=                       # HMAC secret, min 32 chars — see "Setup from scratch" above
```

`DATABASE_URL` is also in `.env` but is a **CLI-only** var — `packages/db/drizzle.config.ts` and
the Supabase CLI (`db:generate`, `db:reset`, `db:migrate`) read it directly; no app code declares
or reads it, since the app never holds an RLS-bypassing DB connection (guests and staff always go
through Supabase's anon-key client, which is what makes RLS apply — see
`docs/architecture.md` § Data). It points at the local Supabase Postgres instance started by
`pnpm db:start` (port `54322`).

`.env` is gitignored; `.env.example` documents the shape but has no real values — fill it in per
"Setup from scratch". Next.js doesn't look outside `apps/web` by default, so
`apps/web/next.config.ts` loads the root `.env` explicitly.

## Common commands

Root scripts run across the workspace via Turborepo; scope to one package with
`pnpm --filter <name> <script>`.

| Command | Does |
|---|---|
| `pnpm dev` | starts Next.js dev server |
| `pnpm build` | production build |
| `pnpm lint` | `biome check .` per package |
| `pnpm format` | `biome format --write .` per package |
| `pnpm typecheck` | `next typegen && tsc --noEmit` (web), `tsc --noEmit` (packages) |
| `pnpm test` | `vitest run` at the repo root |

`pnpm install` also registers a `pre-push` git hook (`simple-git-hooks`) that runs
`typecheck lint test build` before every push — see `docs/tech-stack.md`.

### Database migrations

**Drizzle authors migrations, Supabase CLI applies them — one migration history, in `supabase/migrations/`.**

| Command | Does |
|---|---|
| `pnpm db:start` | boots local Postgres/Auth/Storage/Realtime via Docker |
| `pnpm db:stop` | stops the local stack |
| `pnpm db:generate --name=<name>` | `drizzle-kit generate` — diffs `packages/db/src/schema/` against the last snapshot and writes the delta to `supabase/migrations/<timestamp>_<name>.sql`. Omit `--name` and it picks a random two-word slug instead |
| `pnpm db:migrate` | `supabase migration up` — applies pending migrations to a running DB, no data loss |
| `pnpm db:reset` | drops the local DB, replays every migration, then runs `supabase/seed.sql` — the everyday local command |
| `pnpm db:types` | `supabase gen types typescript --local` — writes `packages/db/src/database.types.ts`, the `Database` type every Supabase client is parameterized with |

Workflow for a schema change: edit `packages/db/src/schema/*.ts` → `pnpm db:generate --name=<name>` → review and commit the generated `.sql` → `pnpm db:reset` to apply it locally → `pnpm db:types` to refresh the generated types, and commit those too.

**Naming `<name>`** — `<verb>_<subject>`, snake_case, table before column:

| Verb | Use for | Example |
|---|---|---|
| `create` | new table | `create_bills` |
| `add` | new column or index | `add_bill_settled_by` |
| `drop` | remove column or index | `drop_menu_item_legacy_price` |
| `rename` | rename column or table | `rename_logical_table_to_restaurant_table` |
| `alter` | type/constraint change on an existing column | `alter_order_items_quantity_type` |
| `enable_rls` | RLS toggle, no policies | `enable_rls` |

No ticket numbers, no dates — the migration's timestamp prefix already carries that.

**Never run** `drizzle-kit migrate`, `drizzle-kit push`, or `supabase db diff` — each starts a second, divergent migration history. Never edit tables by hand in Studio. See `AGENTS.md` guardrails and `docs/architecture.md` for why.

## Local services (Supabase)

Started by `pnpm db:start` (config in `supabase/config.toml`, project id `dineinly`):

| Service | Port |
|---|---|
| API | `54321` |
| Postgres | `54322` |
| Studio (dashboard) | `54323` |
| Inbucket (local email) | `54324` |

Stop everything with `pnpm db:stop`.

## Project structure

```
apps/web                     # Next.js app (tRPC, Supabase client, Tailwind v4)
packages/db                  # Drizzle ORM schema + drizzle-kit config (migrations output to supabase/migrations)
packages/ui                  # shared UI package (semantic HTML + Tailwind + design-system.md tokens, lucide-react icons, no component library)
packages/typescript-config    # shared tsconfig presets
supabase/                    # local Supabase config, migrations/ (Drizzle-generated), seed.sql
docs/                        # governing docs — read before making product/architecture/UI decisions
```
