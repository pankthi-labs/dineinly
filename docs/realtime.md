# Realtime Transport

Governs every Realtime channel, trigger, and client subscription. Do not use Postgres Changes or a custom transport outside this doc.

## Decision

**Broadcast from Database** (Supabase Realtime Broadcast, triggered from Postgres), not Postgres Changes.

Guests subscribe to Supabase *directly* with a scoped JWT (`architecture.md` → Guest Sessions) — no server in the loop. Postgres Changes re-evaluates RLS per client per row-change on a single realtime thread, a scaling ceiling that lands exactly on this high-fanout guest path; Supabase's own current guidance steers to Broadcast past small scale. Broadcast also gives topic routing that maps 1:1 to the tenant/session model and payload control — triggers send only the columns a guest needs, never internal fields like `idempotency_key` or `placed_by`. Cost is one-time: a trigger + `realtime.messages` RLS policy per publishing table, a pattern that then repeats.

Rejected: **Postgres Changes** (simplest, but the RLS-per-row cost and raw-column exposure are wrong for a guest-facing high-fanout system; would force a rewrite to Broadcast later). **Hybrid** (Postgres Changes for staff, Broadcast for guests) — two auth/subscription models for no concrete gain; skipped per YAGNI.

## Channel Model

| Topic | Audience | Carries | Authorization (RLS on `realtime.messages`) |
|---|---|---|---|
| `session:{id}` | Guests + staff on that session | Cart items, order-item status, bill status | JWT `table_session_id` matches topic id AND session `status = active` AND tenant match |
| `restaurant:{id}` | Staff only | Kitchen queue (new orders), floor / table-session state | Staff JWT with matching `restaurant_id`; guest JWTs lack the staff claim and cannot join |
| `menu:{restaurant_id}` | Guests + staff | Availability (86'd) changes only | Any valid token scoped to that `restaurant_id` — menu is already public to guests, nothing sensitive |

Guest-facing order status (`Preparing` → `Partially Served` → `Served`, per `core-data-model.md`) is **derived client-side** from Order Item status — not broadcast separately.

Revocation is live-state, not expiry-based, consistent with Guest Sessions: closing a session immediately fails the `session:{id}` RLS check, denying the channel regardless of token validity.

## Publish Side — Triggers

| Table | Fires on | Topic(s) | Payload |
|---|---|---|---|
| Cart Item | INSERT / UPDATE / DELETE | `session:{session_id}` | Hand-picked columns (id, menu_item_id, quantity, spice/salt/ice, op) — **excludes `added_by_staff_id`**; line-level so concurrent guest edits don't clobber each other |
| Order | INSERT | `session:{session_id}` + `restaurant:{restaurant_id}` | New round. Guest topic: order id + item summary only (**no `idempotency_key`/`placed_by`**). Staff topic: full row |
| Order Item | UPDATE of `status` | `session:{session_id}` + `restaurant:{restaurant_id}` | Guest topic: item name/status only. Staff topic: full row |
| Bill | UPDATE of `status` | `session:{session_id}` | `requested` / `settled` |
| Table Session | INSERT / UPDATE of `status` | `restaurant:{restaurant_id}` | Floor view: session open/close, table free/busy |
| Menu Item | UPDATE of `availability` | `menu:{restaurant_id}` | Item id + new availability only |

Guest-facing topics (`session:{id}`, `menu:{restaurant_id}`) use explicit `realtime.broadcast()` with a hand-picked column set — never the raw row. Staff-only topic (`restaurant:{id}`) may use `realtime.broadcast_changes()` with the default record payload since no guest ever sees it.

Trigger SQL and `realtime.messages` RLS policies are written alongside the Drizzle schema in `packages/db` — this doc is the contract they implement, not the implementation itself.

## Subscribe Side — Client

`supabase.channel(topic).on('broadcast', { event }, handler)`. Handler patches or invalidates the matching **TanStack Query** cache (existing tRPC/React Query pattern). **Zustand** holds UI-only state — never realtime data. No polling anywhere in the app.
