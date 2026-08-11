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

## Guest side not wired to realtime

`session:{id}` channel (`docs/realtime.md`) broadcasts cart/order-item changes to every guest at the table. Nothing subscribes to it — `apps/web/app/guest/menu/page.tsx`, `apps/web/app/guest/orders/page.tsx`, and `apps/web/app/guest/bill/page.tsx` all poll `refetchInterval: 8_000` instead. A second guest adding to cart, an order-item advancing to Ready, or a bill moving to `settled` won't show up for a guest until the next 8s poll tick, not live. On the bill screen the poll also re-runs `request_bill()` every tick — harmless while nothing broadcasts on `bills`, but the trigger in `docs/realtime.md` (Bill, UPDATE of `status`) needs a `WHEN (OLD.status IS DISTINCT FROM NEW.status)` guard so those no-op re-writes don't each emit a broadcast. Same interim tradeoff already accepted for the Kitchen Display below.

**Pick up:** wire together with "Kitchen queue not wired to realtime" below — same missing Broadcast infra covers both.

---

## Kitchen queue not wired to realtime

`apps/web/app/restaurants/[restaurantId]/kitchen/page.tsx` polls `kitchen.listQueue` on an 8s interval instead of subscribing to the `restaurant:{id}` topic (`docs/realtime.md`) — no Broadcast-from-Database trigger, `realtime.messages` RLS policy, or client channel subscription exists anywhere in the app yet (same gap as "Guest side not wired to realtime" above). `docs/architecture.md`/`docs/realtime.md` mandate no polling; this is the interim, same tradeoff already accepted for the guest cart.

**Pick up:** build the `restaurant:{id}` Broadcast infra (trigger functions on `orders` INSERT and `order_items` status UPDATE, `realtime.messages` RLS keyed on staff/admin restaurant membership, `realtime.topic()`-based authorization) once it's built for one table — likely worth doing once for every table in `docs/realtime.md`'s Publish Side table rather than per-feature. Swapping the Kitchen Display's polling for a channel subscription only touches the `refetchInterval` call in `page.tsx`, not the query shape.

---

## No Call Waiter action on the bill

The guest bill screen (`apps/web/app/guest/bill/page.tsx`) has no way to summon staff — no mutation, no realtime notification to the floor.

**Pick up:** needs the realtime Broadcast infra (see "Guest side not wired to realtime" below) to notify staff live, plus a decision on what a waiter-facing "call" surface looks like (toast on Kitchen Display? a separate Floor view? no Floor view exists yet).

---

## No Email Bill action

The guest bill screen has no way to email/export the bill — no guest email capture anywhere in the guest flow (guests never have accounts, per AGENTS.md), no email-sending integration.

**Pick up:** decide how a guest supplies an email (one-off field on the bill screen vs. something persisted) and which email provider to use — not decided yet, don't guess either.

---

## Force-terminate session handling — TBD in docs

Void vs. settle handling of an open bill on force-terminate, marked `TBD` in `docs/core-data-model.md` / `docs/product.md`.

**Pick up:** do not guess — flag and ask (`AGENTS.md`).
