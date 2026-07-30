# Tech Stack

> Canonical stack for this repo. All AI coding agents must follow this unless an ADR supersedes it.

---

# Core Technologies

| Category | Technology |
|----------|------------|
| Languages | TypeScript, Python (post-MVP, AI only) |
| Frontend | Next.js 16 (App Router) |
| Backend (TypeScript) | tRPC |
| Backend (AI) | FastAPI (Python, `apps/intelligence`) — **deferred — post-MVP** |
| Database | PostgreSQL (Supabase) |
| ORM | Drizzle ORM |
| Authentication | Supabase Auth |
| Multi-tenancy | PostgreSQL Row Level Security (RLS) — mandatory on every tenant-facing table |
| Realtime | Supabase Realtime |
| File Storage | Supabase Storage — sanctioned choice; no MVP use yet (text-only, no images). Do not reach for another storage tech when a need arrives |
| Background Jobs | Inngest — sanctioned choice; no MVP job yet. Do not reach for another queue/cron tech when a job arrives |
| Caching | Next.js `unstable_cache`/`React.cache()` |

---

# Frontend

| Category | Technology |
|----------|------------|
| Styling | Tailwind CSS v4 |
| UI Components | None — no component library. Raw semantic HTML styled with `design-system.md` tokens only |
| Icons | Lucide (`lucide-react`) — sanctioned choice, ISC license. See `design-system.md` §11 for stroke/size rules. Do not reach for another icon set |
| Breakpoint mechanism | `postcss-custom-media` — sanctioned choice, MIT license, dev dependency. Defines the 4 breakpoint tokens once; see `design-system.md` §10. `var()` cannot be used in `@media`, this is the mechanism instead of raw duplicated values |
| Client State | Zustand |
| Server State | TanStack Query (via tRPC) |

---

# Monorepo & Build

| Category | Technology |
|----------|------------|
| Monorepo | Turborepo |
| Package Manager | pnpm |
| Build Tool | Turbopack |
| Package Bundler | tsup |
| Linting & Formatting | Biome |
| Database Migrations | Supabase CLI — pinned devDependency, applies Drizzle-generated SQL from `supabase/migrations/`. See `architecture.md` § Data |

---

# Infrastructure

| Category | Technology |
|----------|------------|
| Web Hosting | Vercel |
| Python Service Hosting | Railway — **deferred — post-MVP** |
| CDN & DNS | Cloudflare |
| CI/CD | GitHub Actions |

---

# Observability & Analytics

| Category | Technology |
|----------|------------|
| Error Tracking | Sentry |
| Logging | Axiom |
| Product Analytics | PostHog |

---

# Communication

| Category | Technology |
|----------|------------|
| Email Delivery | Resend |
| Email Templates | React Email |

---

# Testing

| Category | Technology |
|----------|------------|
| Unit Testing | Vitest |
| End-to-End Testing | Playwright |

---

# Security

| Category | Technology |
|----------|------------|
| Validation | Zod |
| Session Management | httpOnly cookies (via `@supabase/ssr`) |
| Environment Validation | `@t3-oss/env-nextjs` |
| Rate Limiting | Upstash Redis — sanctioned choice for when rate-limiting is implemented; not wired in the MVP baseline. Not used as a cache layer (see `architecture.md`) |

---

# Architecture Rules

- Modular monolith. No microservices.
- tRPC is the only data layer. Server Actions are for post-auth redirects only — never CRUD.
- FastAPI/Python is deferred — not part of the MVP. When introduced it is only for AI/analytics/ML jobs in `apps/intelligence` and must preserve tenant isolation (documented before implementation).
- Every tenant-facing table must have RLS enabled.
- Drizzle schema (`packages/db/schema`) is the DB schema source of truth.
- Shared code goes in `/packages`.
- Mobile is PWA-first. No native apps.
- Payments are out of scope for the MVP. Dineinly supports settlement only (bill marked paid externally); no payment gateway or processing.
- Staff auth uses Supabase persistent sessions: Owners/Managers via Email OTP; kitchen displays and shared floor tablets via per-restaurant station accounts. The floor-staff PIN is an app-level attribution layer, not a Supabase auth factor.
- No UI component library (no shadcn/ui or equivalent). Build with semantic HTML/CSS against `design-system.md` tokens only.

---

# Do Not Use

| Instead of | Use |
|---|---|
| Prisma | Drizzle ORM |
| Redux | Zustand + TanStack Query |
| GraphQL | tRPC |
| Server Actions (for CRUD) | tRPC |
| Custom WebSocket server | Supabase Realtime |
| Auth0 / Clerk | Supabase Auth |
| Component library (shadcn/ui, MUI…) | Semantic HTML + `design-system.md` tokens |
| MongoDB / NoSQL | PostgreSQL (use JSONB columns for flexibility) |
| Kubernetes / microservices | Modular monolith on Vercel (Railway post-MVP) |
| `drizzle-kit push` / `drizzle-kit migrate` | `drizzle-kit generate` (author) + `supabase db reset` / `db push` (apply) |
| `supabase db diff` | Drizzle schema as the migration author |

---

# Development Standards

- Use pnpm exclusively.
- Use Turborepo for workspace orchestration.
- TypeScript by default; Python only in `apps/intelligence` (deferred — post-MVP, AI only).
- Conventional Commits.
- Trunk-based development. Feature branches → PR → `main`. `main` is protected.
