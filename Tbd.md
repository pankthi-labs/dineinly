# TBD

Deferred work, tracked in one place. Each entry: what's missing, why it's deferred, where to pick it up.

---

## PIN station login for Kitchen/Floor

Not implemented. Only Owner/Manager email OTP exists (`apps/web/app/sign-in/`). `docs/architecture.md` requires a shared station account + app-level PIN for Kitchen/Floor — no PIN storage, verification, or UI anywhere in the codebase.

**Pick up:** design PIN hash storage + verification alongside the Staff Roster work (see below) — station account is a Staff concept.

---

## No app-level OTP rate limiting

No lockout after N failed OTP attempts, no app-level throttling on `resolveSignIn` or `verifyOtp` (`apps/web/server/routers/auth.ts`). Relies entirely on Supabase GoTrue's own defaults.

**Pick up:** decide the lockout policy (attempts, window, cooldown) before implementing — don't guess a number.

---

## No invite-expiry concept

An `invited` Staff row never expires (`packages/db/src/schema/staff.ts`). Sign-in can't distinguish "your invite expired" from any other failure — all collapse to the generic `SEND_FAILED_MESSAGE` by design (see comment at `apps/web/app/sign-in/sign-in-form.tsx`).

**Pick up:** decide whether invites should expire and after how long before adding an `invited_at`/expiry column and differentiated messaging.

---

## Feature-level staff permissions

Every active Staff role (Owner/Manager/Kitchen/Floor) can now reach every restaurant page and every Menu Desk action once signed in (`requireRestaurantAccess`, `staff_all_menu_*` RLS — `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 5). There's no role-level split yet — a Waiter can open Venue Settings, a Kitchen account can edit dishes, same as an Owner.

**Pick up:** design the actual RBAC matrix per `docs/product.md` (which role may do what) alongside Staff Roster, then gate individual pages/mutations by `staff.role`, not just restaurant membership.

---

## Owner reassignment

Once a restaurant's owner status flips to `active`, owner fields lock permanently in the edit form (`restaurant-form-sheet.tsx`) — no escape hatch if that owner needs to be replaced.

**Pick up:** build as part of Staff Roster, same as the Staff RLS item above — reassignment is explicitly a Staff Roster capability per `docs/core-data-model.md`.

---

## No bulk actions or restaurant detail/analytics page

Restaurants Directory has no "View" (no per-restaurant detail/analytics page) and no bulk actions (bulk pause, bulk export).

**Pick up:** decide scope once there's a concrete need — analytics page and bulk actions are separate efforts, don't assume they ship together.

---

## Audit logging: doc/code mismatch

`docs/product.md` states Dineinly Admin's cross-tenant actions are "audited," but `audit_logs` is explicitly deferred out of MVP (`docs/core-data-model.md`). No audit trail currently exists anywhere in the app.

**Pick up:** either implement `audit_logs` or soften the product.md claim — flag to stakeholders before deciding which.

---

## No category delete/archive

`menu.ts` has `createCategory` but no delete or archive mutation — categories are create-only today.

**Pick up:** decide whether delete should be hard-delete (blocked if items exist) or archive-style like items/restaurants before building.

---

## No label update/delete

`menu.ts` has `createLabel` but no update or delete mutation — labels are create-only today, same gap as categories.

**Pick up:** decide rename-vs-delete semantics, and what happens to items already carrying a label that gets deleted, before building.

---

## No dish duplication

No "duplicate this dish" action in Menu Desk — every new dish is built from scratch even when it's a near-copy of an existing one.

**Pick up:** straightforward once prioritized — clone the item's fields client-side into the Add Dish form, or a server `duplicateItem` mutation.

---

## No guest-facing menu preview from the admin side

Menu Desk has no way to see what a dish/category looks like from the guest ordering view without leaving the admin panel.

**Pick up:** the guest-facing menu UI now exists (`apps/web/app/guest/menu/page.tsx`) — no longer blocked, just not prioritized yet.

---

## Waiter serve flow missing

No mutation anywhere sets `order_items.status = 'served'`. `kitchen.ts`'s `advanceBatch` only moves `placed → preparing → ready` (`ADVANCE_FROM` map, `apps/web/server/routers/kitchen.ts`); nothing moves `ready → served`. Consequence: once the kitchen marks a dish Ready, it sits there forever — the guest-facing status (`apps/web/server/routers/guest.ts` `orders.list`, derived `preparing`/`partially served`/`served`) can never advance past "preparing" in practice, since no item ever reaches `served`.

**Pick up:** Floor/Waiter router + UI to mark item(s) served, gated by the Waiter role once role-level RBAC exists (see "Feature-level staff permissions" above). Known and explicitly out of scope for now.

---

## Request bill has no terminal-status guard

`request_bill()` (`supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 11) lets a guest request the bill at any point, regardless of order item status — same for `docs/core-data-model.md`'s Request Bill lifecycle line. A real dine-in flow should only allow it once every Order Item in the session is `served` or `cancelled` (nothing left `placed`/`preparing`/`ready`).

**Pick up:** intentionally left unguarded for now — blocks dev testing, since seeded/test sessions rarely have every item served. Add the check (in `request_bill()` or `guest.bill.get`) once dev/testing can produce fully-served sessions on demand.

---

## No Call Waiter action on the bill

The guest bill screen (`apps/web/app/guest/bill/page.tsx`) has no way to summon staff — no mutation, no realtime notification to the floor.

**Pick up:** the realtime Broadcast infra now exists (`session:{id}`/`restaurant:{id}` topics, `apps/web/lib/realtime/`) — this only needs a mutation plus a decision on what a waiter-facing "call" surface looks like (toast on Kitchen Display? a separate Floor view? no Floor view exists yet).

---

## No Email Bill action

The guest bill screen has no way to email/export the bill — no guest email capture anywhere in the guest flow (guests never have accounts, per AGENTS.md), no email-sending integration.

**Pick up:** decide how a guest supplies an email (one-off field on the bill screen vs. something persisted) and which email provider to use — not decided yet, don't guess either.

---

## Settle bill not implemented

`docs/core-data-model.md` and `docs/product.md` describe "Settle bill" (staff confirms external payment, `bills.status` -> `settled`) as a working action. No mutation/RPC exists anywhere (`grep -rn "settled"` across `apps/web/server`, `packages/db`, `supabase/migrations` only finds the enum definition, a check constraint, and the guest UI's display branch for an already-settled bill). A bill can reach `requested` via `request_bill()` but nothing ever moves it to `settled`.

**Pick up:** Waiter/Floor router + UI to mark a bill settled once staff confirms external payment (no payments processing per AGENTS.md — this only records the fact), gated by role once role-level RBAC exists (see "Feature-level staff permissions" above).

---

## Close session not implemented

`docs/core-data-model.md` and `docs/product.md` describe closing a table session (`table_sessions.status` -> `closed`, frees the table) as a working action. No mutation/RPC exists — a table occupied via QR scan stays occupied indefinitely; nothing ever sets a session's status to `closed`.

**Pick up:** almost certainly ships together with Settle bill (closing a session is the natural follow-on to settling its bill) — Waiter/Floor router + UI, same role gating.

---

## Merge tables not implemented

`docs/product.md` describes merging tables (for shared/combined dining parties) as a working action. No merge router procedure or RPC exists in the codebase.

**Pick up:** lower priority than Settle bill / Close session — scope once there's a concrete need.

---

## Force-terminate session handling — TBD in docs

Void vs. settle handling of an open bill on force-terminate, marked `TBD` in `docs/core-data-model.md` / `docs/product.md`.

**Pick up:** do not guess — flag and ask (`AGENTS.md`).
