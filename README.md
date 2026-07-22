# Dineinly

Premium, real-time, multi-tenant dine-in platform (QR ordering, kitchen workflow, billing,
restaurant management). Modular monolith: Next.js + tRPC + PostgreSQL/Supabase.

See [`AGENTS.md`](./AGENTS.md) for agent/contributor instructions and the governing docs in
[`docs/`](./docs) (product, architecture, tech stack, design system).

## Getting started

```bash
pnpm install
pnpm dev
```

Requires a local Supabase instance (`supabase start`) with `DATABASE_URL` set in a root `.env`
(see `packages/db/drizzle.config.ts`).

## Common commands

- `pnpm build` / `pnpm dev` / `pnpm lint` / `pnpm format` / `pnpm typecheck` — run across the
  workspace via Turborepo; scope to one package with `pnpm --filter <name> <script>`.
