# Architecture

Architectural principles for Dineinly. Technology choices are in `tech-stack.md`.

## Core Principles

- **Modular monolith** — one repo, multiple packages, shared types/components. No microservices.
- **Multi-tenant first** — every restaurant is an isolated tenant. No cross-tenant data leakage; tenant isolation at every layer.
- **Real-time first** — state changes propagate immediately. No polling, no manual refreshes.
- **Server-first** — business logic on the server; clients display state and never own business rules.
- **Single source of truth** — PostgreSQL. Never duplicate business state.
- **Security by default** — enforced on every endpoint, table, and action.

## System Layers

`Guest → Frontend → tRPC → Business logic → PostgreSQL → Realtime → Clients`

FastAPI/Python is post-MVP (see `tech-stack.md`). When introduced it must preserve identical tenant-isolation guarantees, documented first.

## Data

- Every entity belongs to exactly one restaurant; every query is tenant-scoped; every mutation validated.
- Server state lives on the server; client state is UI-only. Never trust client input.
- Soft-delete where recovery matters. Schema changes only via migrations — never bypass them.
- Drizzle schema (`packages/db/schema`) is the DB source of truth.

## Authentication

Role-specific and passwordless.

- **Owners & Managers:** Supabase Email OTP only (no magic links).
- **Kitchen displays & shared floor tablets:** per-restaurant station account with a persistent Supabase session — the auth/DB boundary, representing the trusted device. On floor tablets, individual staff identify via an application-level PIN used only for attribution/RBAC/audit/UI — it is not a Supabase auth factor and grants no DB access.
- **Guests:** short-lived scoped token (see below); never create accounts.

Restaurant identity is always server-derived. NFC badges and WebAuthn/passkeys are not planned — station-account + PIN is final.

## Guest Sessions & Anonymous Realtime

1. Guest scans QR → server validates and resolves it to a logical table → finds/creates the active table session → issues a signed token with only that session's claims (`restaurant_id`, `table_session_id`, guest role, expiry).
2. Guest talks to Supabase directly; RLS authorizes every query and Realtime subscription from that token.

Rules:
- Guests never get service-role credentials and never bypass RLS. Token scope is exactly one active table session.
- Use Supabase-native anonymous auth with custom claims (or asymmetric JWT signing keys). Do not hand-roll tokens.
- Tokens are long-lived (≥12h, longer for events) so a meal never expires; silent refresh gated on the session being active.
- Revocation is not via expiry: RLS policies check live session state (`status = active`), so closing a session denies access immediately.
- Abuse control: staff can see/remove participants; token issuance is rate-limited per QR.

## Authorization & Idempotency

- RBAC (matrix in `product.md`) is enforced server-side on every mutation; client-side checks are UX-only.
- Dineinly Admin is the only cross-tenant path (audited). No other code crosses tenant boundaries.
- All order mutations (submit, add/remove item, update quantity, cancel) must be idempotent via client-supplied idempotency keys — retries/repeated taps never duplicate or corrupt state.

## Real-Time

Real-time is a core capability across guests, waiters, kitchen, and managers; the UI never requires refreshes. Transport (Supabase Broadcast vs Postgres Changes) is TBD — next iteration.

## Operational Standards

- **APIs:** thin clients, predictable contracts, consistent validation, business logic in APIs.
- **Performance:** optimize perceived speed; minimize requests and re-renders; lazy-load and cache responsibly.
- **Errors:** recoverable, explain what happened, give the next action. Never fail silently.
- **Observability:** structured logs, traceable errors, every production issue diagnosable.

## Core Data Model — TBD (next iteration)

Not yet finalized. Do not invent core entities or relationships outside the forthcoming model. Everything downstream (Drizzle schema, RLS policies, tRPC routers, Realtime channels, API contracts) derives from it once locked.

Intended entities: Restaurant, Logical Table, QR Code, Table Session, Guest Session, Staff, Role, Menu Category, Menu Item, Item Preference (Spice/Salt/Ice), Cart, Order, Order Item, Bill, Bill Line Item, Restaurant Settings, Analytics Event.

## AI Guidance

Preserve modularity, tenant isolation, real-time behaviour, and security. Prefer simpler solutions, minimise dependencies, avoid new infrastructure unless necessary. Follow `tech-stack.md`.
