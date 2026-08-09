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

## Cart router

No `cart` tRPC router. The guest menu drawer's quantity + spice/salt/ice picker (`apps/web/app/guest/menu/page.tsx`) is visual-only — its "Add to Order" button doesn't call anything. RLS already grants guests insert/update/delete on their own session's `cart_items` (`supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 3).

**Pick up:** guest-scoped mutations (add/update/remove `cart_items`), then wire the drawer to them.

---

## No cart screen

No shared-cart view. Guest needs to see/edit the live cart (multi-guest, last-write-wins per `docs/product.md`) before confirming an order.

**Pick up:** build once the cart router above exists.

---

## Confirm-cart RPC

Guests only have `select` on `orders`/`order_items` (no insert — same migration, § 3), so confirming a cart can't be a plain guest-scoped insert.

**Pick up:** a `SECURITY DEFINER` function (mirrors `resolve_qr_token`) that atomically moves `cart_items` → `order` + `order_items`, sets `idempotency_key`, then clears the cart. `docs/product.md`: "Confirming sends the cart to the kitchen as an order (one round) and clears the cart."

---

## No order status screen

RLS read access to `orders`/`order_items` is already in place for guests, no UI consumes it yet.

**Pick up:** build once orders can actually be placed (needs the confirm-cart RPC above).

---

## Guest side not wired to realtime

`session:{id}` channel (`docs/realtime.md`) broadcasts cart/order-item changes to every guest at the table. Nothing subscribes to it yet — a second guest adding to cart won't show up live for the first.

**Pick up:** wire once the cart screen exists — no point subscribing before there's a view to update.

---

## Tax/service/rounding formula — TBD in docs

Marked `TBD` in `docs/core-data-model.md`. Blocks real order/bill totals.

**Pick up:** do not guess — flag and ask (`AGENTS.md`).

---

## Force-terminate session handling — TBD in docs

Void vs. settle handling of an open bill on force-terminate, marked `TBD` in `docs/core-data-model.md` / `docs/product.md`.

**Pick up:** do not guess — flag and ask (`AGENTS.md`).
