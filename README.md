# Dineinly

Premium, real-time, multi-tenant dine-in platform (QR ordering, kitchen workflow, billing,
restaurant management). Modular monolith: Next.js + tRPC + PostgreSQL/Supabase.

See [`AGENTS.md`](./AGENTS.md) for agent/contributor instructions and the governing docs in
[`docs/`](./docs):

- [`docs/product.md`](./docs/product.md) — business rules, order flow, menu, billing, RBAC
- [`docs/architecture.md`](./docs/architecture.md) — data layer, auth, RLS/tenancy, realtime, API
- [`docs/tech-stack.md`](./docs/tech-stack.md) — dependencies, infra, tooling
- [`docs/design-system.md`](./docs/design-system.md) — UI tokens, styling, motion

## Prerequisites

Install these before anything else:

| Tool | Version | Install |
|---|---|---|
| Node.js | `>=24.18.0 <25` | [nvm](https://github.com/nvm-sh/nvm) / [fnm](https://github.com/Schniz/fnm) recommended |
| pnpm | `11.15.1` | `corepack enable` (reads `packageManager` in `package.json`) |
| Docker | any recent | required by Supabase CLI to run local Postgres/Auth/Storage |
| Supabase CLI | latest | `brew install supabase/tap/supabase` (or see [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli)) |

## Setup from scratch

```bash
git clone <repo-url>
cd dineinly

cp .env.example .env       # DATABASE_URL already points at local Supabase

pnpm install                # installs all workspaces (apps/web, packages/*)

supabase start              # boots local Postgres/Auth/Storage/Realtime via Docker
                             # first run pulls Docker images, takes a few minutes

pnpm --filter @workspace/db exec drizzle-kit push   # apply schema to local DB
                                                     # (no migrations committed yet — push, don't migrate)

pnpm dev                    # turbo dev -> next dev
```

App runs at **http://127.0.0.1:3000**.

## Environment

Only one env var is required, read from the **monorepo root** `.env` by
`packages/db/drizzle.config.ts`:

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

This points at the local Supabase Postgres instance started by `supabase start` (port `54322`).
`.env` is gitignored; `.env.example` is committed and safe to copy as-is for local dev.

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

Database (no named `db:*` scripts yet — invoke drizzle-kit directly):

| Command | Does |
|---|---|
| `pnpm --filter @workspace/db exec drizzle-kit generate` | generate a migration from schema changes |
| `pnpm --filter @workspace/db exec drizzle-kit migrate` | apply committed migrations |
| `pnpm --filter @workspace/db exec drizzle-kit push` | push schema straight to DB, no migration file (use for local dev now) |

Schema lives at `packages/db/src/schema/index.ts`, migrations output to `packages/db/drizzle`.

## Local services (Supabase)

Started by `supabase start` (config in `supabase/config.toml`, project id `dineinly`):

| Service | Port |
|---|---|
| API | `54321` |
| Postgres | `54322` |
| Studio (dashboard) | `54323` |
| Inbucket (local email) | `54324` |

Stop everything with `supabase stop`.

## Project structure

```
apps/web                     # Next.js app (tRPC, Supabase client, Tailwind v4)
packages/db                  # Drizzle ORM schema, migrations, drizzle-kit config
packages/ui                  # shared UI package (Base UI + Tailwind, no component library)
packages/typescript-config    # shared tsconfig presets
supabase/                    # local Supabase config (config.toml, seed.sql)
docs/                        # governing docs — read before making product/architecture/UI decisions
```
