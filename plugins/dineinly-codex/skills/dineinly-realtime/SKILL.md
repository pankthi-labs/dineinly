---
name: dineinly-realtime
description: Implement or review Dineinly realtime broadcasts, PostgreSQL triggers, Supabase Realtime authorization, and client subscriptions. Use for live cart, order, bill, table-session, menu availability, or kitchen/floor update work in the Dineinly repository.
---

# Dineinly Realtime

Read `AGENTS.md`, `docs/realtime.md`, and `docs/architecture.md` before changing realtime behavior. Read `docs/product.md` and `docs/core-data-model.md` for the affected state transition.

## Workflow

1. Use Broadcast from Database only. Do not introduce Postgres Changes, polling, or a custom transport.
2. Use only the documented `session:{id}`, `restaurant:{id}`, and `menu:{restaurant_id}` topics and their stated audiences.
3. Add or update a trigger and matching `realtime.messages` RLS policy together. Scope authorization to live tenant/session claims.
4. Hand-pick guest payloads; never expose internal fields. Staff-only restaurant payloads may use the documented full-row pattern.
5. Subscribe directly with the scoped JWT and patch or invalidate TanStack Query data. Keep realtime data out of Zustand.
6. Preserve live-state revocation: closed sessions must immediately lose access.

## Verification

Test publishing, delivery, denied cross-tenant access, denied closed-session access, and guest payload shape for every affected topic.
