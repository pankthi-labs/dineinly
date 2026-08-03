# Core Data Model (C5)

Everything downstream — Drizzle schema, RLS policies, tRPC routers, Realtime channels, API contracts — derives from this. Do not add entities outside this model without updating this doc first.

## Design principle

One rule, applied to every entity: **own lifecycle, own RLS policy, or queried independently → it's a table. Otherwise, it's a column.**

Optimized for a 3-developer team shipping fast: fewer joins, simpler RLS, less Drizzle boilerplate. Not textbook normalization. Still non-negotiable: tenant isolation, price/menu snapshot immutability, idempotent order submission (see `AGENTS.md` guardrails).

Every table below carries `restaurant_id` (tenant scope, RLS precondition). Soft-delete only where recovery matters: Restaurant, Staff, Menu Category, Menu Item.

## Tables

| Table | Key columns | Purpose |
|---|---|---|
| **Restaurant** | name, address, gst_number, state, pincode, service_charge_rate (nullable) | Tenant root. Settings folded in — read on nearly every request, no join. Tax is per-category, not per-restaurant (see Menu Category). address/gst_number/state/pincode are the bill header fields. `service_charge_rate` null = restaurant levies no service charge. |
| **Staff** | restaurant_id, user_id (nullable FK to Supabase `auth.users`), email, name (nullable), mobile (nullable), role (enum: waiter/kitchen/manager/owner), pin_hash (nullable), status, is_primary_owner | Identity + RBAC — tenant employees only. Guest is not a Staff role — guests never have accounts (see AGENTS.md). Dineinly Admin is not a Staff row either — it's a platform-level Supabase Auth identity carrying a privileged claim, authorized by RLS from that claim; keeping it out of Staff avoids a nullable `restaurant_id` and RLS special-casing. `pin_hash` is floor/kitchen attribution only — never a DB auth factor. `user_id` is the Supabase Auth identity that actually logs in (Email OTP for Owner/Manager, shared station account for Kitchen/Waiter) — RLS matches `auth.uid()` against it. Unique on `(restaurant_id, user_id)` where not null and not removed: one identity, at most one active Staff row per restaurant, but it can still staff several restaurants. Not a typed Drizzle FK — `auth` is a Supabase-owned schema, so the constraint is hand-written SQL (see `docs/architecture.md` § Data). `name`/`mobile` are populated only when Dineinly Admin creates a restaurant and invites its owner (Restaurants Directory); other invite paths (Owner/Manager inviting Waiters, Kitchen, other Managers) leave them null. `is_primary_owner` marks the restaurant's one admin-contact owner — unique per restaurant among `role = owner` (partial unique index); reassigning it flips the flag rather than removing the previous owner, who keeps full access as a regular owner. Both admin-only writes go through `admin_create_restaurant`/`admin_reassign_primary_owner`, atomic Postgres functions (`supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 5). |
| **Restaurant Table** | restaurant_id, label, qr_token, session_id (nullable FK) | Physical floor plan — a table guests sit at. QR is 1:1 static, folded as a column. `session_id` = the table's current active session; merge = multiple tables pointing at the same session. |
| **Table Session** | restaurant_id, status (active/closed), opened_at, closed_at | One dining visit. Groups the shared cart, all orders, and the bill for that visit. |
| **Menu Category** | restaurant_id, name, sort, tax_rate | Menu grouping and display order. Own table for stable IDs and reordering. `tax_rate` lives here, not on Restaurant — food and drinks are taxed at different rates. |
| **Menu Item** | restaurant_id, category_id, name, description, price, prep_time, serving_size, diet (enum), availability, labels (text[]), spice/salt/ice (nullable enums) | Sellable catalog item. Labels and option groups folded as arrays/columns — no child tables. Option fields only apply when set; never affect price. |
| **Cart Item** | restaurant_id, session_id, menu_item_id (live FK), quantity, spice/salt/ice, added_by_type (enum: staff/guest), added_by_staff_id (nullable) | Live shared cart, pre-confirm. Rows, not a JSON blob — row-level writes so two guests adding different items never clobber each other. Concurrent edits to the *same* line are last-write-wins. Attribution is explicit (type + nullable staff FK), not inferred from nullability alone. |
| **Order** | restaurant_id, session_id, placed_at, placed_by_type (enum: staff/guest), placed_by_staff_id (nullable), idempotency_key (unique) | One confirmed round, sent to the kitchen. `placed_by_staff_id` is set to the Staff id when a waiter/manager/owner places it, null for a guest — `placed_by_type` states which explicitly. `idempotency_key` blocks duplicate orders from retries or repeated taps. |
| **Order Item** | order_id, item_name, unit_price, tax_rate, diet, quantity, spice/salt/ice, status (placed/preparing/ready/served/cancelled), menu_item_id (nullable soft ref) | Kitchen fulfillment line. **Snapshots** name/price/diet/tax_rate at order time — later menu, category, or tax-rate edits never alter past orders or bills. Also serves as the bill line item. |
| **Bill** | restaurant_id, session_id (1:1), status (open/requested/settled), service_charge_rate (snapshot), subtotal, tax_amount, service_charge_amount, total (all nullable until settle), settled_at, settled_by | Financial record for the session. Own table: a bill has its own lifecycle (open → requested → settled) distinct from the session's, and is the highest-value table to keep clean for future settlement/reprint features. Amounts are **derived on read** for presentation (open/requested) and **frozen** only at settle — see lifecycle. Dineinly never processes payment, so no settlement-method column — only *that* it settled. |

10 tables total.

## Relationships

- Restaurant 1—N everything tenant-scoped.
- Restaurant Table N—1 Table Session (via `session_id`). A table has zero or one active session. Merge = multiple tables share one `session_id`. **MVP:** merge only joins a **session-less (free) table** into an existing session — two already-active sessions are never merged.
- Table Session 1—N Cart Item, 1—N Order, 1—1 Bill.
- Order 1—N Order Item.
- Menu Category 1—N Menu Item.
- Bill total = SUM(Order Items in the session) + tax + service charge — **derived on read** for presentation (open/requested), **computed and stored** at settlement.

**MVP pricing:** all prices are tax-**exclusive** — no inclusive mode, no `tax_mode` column. `tax_rate` is set per Menu Category (food and drinks can carry different rates, e.g. 5% vs 18%) and snapshotted onto Order Item at order time; `service_charge_rate` stays a static per-restaurant setting. Bill's tax breakdown (e.g. CGST/SGST) is derived by grouping the session's Order Items by `tax_rate` and splitting each slab in display; nothing beyond the flat total is stored. The exact tax/service/rounding formula (`TBD`) is decided at implementation — flag before guessing a rounding rule.

## Folded, not modeled as tables

| Would-be table | Folded into | Why |
|---|---|---|
| Restaurant Settings | Restaurant (columns) | 1:1, read every request — no benefit joining. |
| QR Code | Restaurant Table (`qr_token` column) | Static 1:1, never queried on its own. |
| Cart | Cart Item (`session_id` FK directly) | 1:1 with session, no fields of its own. |
| Bill Line Item | Order Item (already a snapshot) | Duplicate data — Order Item already has name/qty/price frozen. |
| Guest Session | JWT claims only, no row | Guest identity is the signed token itself (`restaurant_id`, `table_session_id`); RLS checks `session.status = active`. No DB row needed. |

## Deferred (not in MVP — add when a real need arrives)

| Deferred | Trigger to add | Note |
|---|---|---|
| `analytics_events` | Analytics/KPI requirements are defined | High-volume, append-only, short retention. |
| `audit_logs` | Dineinly-Admin cross-tenant tooling ships | Low-volume, permanent. Separate table from analytics — different retention and immutability needs, don't merge them. |
| Shared `idempotency_keys` table | A second mutation type (cancel/modify) needs a dedupe guarantee beyond Order's unique key | Submit Order is the only mutation that can create duplicate money-affecting state; a unique `idempotency_key` column on Order covers MVP. |
| Session↔Table join table (merge history) | Table merges need an audit trail of which tables were merged when | `session_id` FK on Restaurant Table is sufficient while merges don't need history. |
| Guest Session table | Per-participant removal / attribution needed | Currently out of MVP scope per `product.md`. |
| Split Bill | Split-bill feature ships | Bill is already its own table — no extraction needed, only a cardinality change (session 1—N bills). |

## Lifecycle invariants

- **Order Item status:** `placed` → `preparing` → `ready` → `served`. `cancelled` reachable only from `placed`. Kitchen advances status only, never cancels.
- **Guest-facing status** (derived, never stored): `Preparing` → `Partially Served` → `Served`.
- **Confirm cart:** atomically create Order + Order Items from Cart Items, then delete those Cart Items. Guarded by Order's `idempotency_key`.
- **Availability change:** affects future orders only. Existing Order Items are immune by construction (snapshot).
- **Request bill:** create/mark Bill `requested`, snapshot current tax/service rates onto it. Guests can request the bill anytime; displayed totals are derived on read from Order Items until settle.
- **Settle bill:** compute and store subtotal/tax/service/total, `status = settled`.
- **Close session:** requires no in-progress orders and bill settled → `status = closed`; free the table (`session_id` cleared on next scan); hard-delete any unfired Cart Items for that session.
- **Force-terminate session:** staff (waiter/manager/owner) may force-close an abandoned session (walkout) — frees the tables. Void vs. settle handling of any open bill is `TBD` — decided at implementation, flag before guessing.
- **One bill per session** — no split bills in MVP.
