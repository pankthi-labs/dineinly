# TBD

Deferred work, tracked in one place. Each entry: what's missing, why it's deferred, where to pick it up.

---

## PIN station login for Kitchen/Floor (device pairing half)

`pin_hash` storage + set/change now ships two ways: self-service (`set_staff_pin`, § 15b) via the "Profile" header action's PIN field (`apps/web/app/admin/profile-sheet.tsx`, reachable on any restaurant-scoped page), and a Dineinly Admin override (`admin_reset_staff_pin`, § 15b) via "Reset PIN" on any Staff Roster row — for a forgotten PIN, since it's never tied to an inbox. Still missing: the shared station account itself (synthetic `auth.users` identity per restaurant/role) and the 6-digit pairing-code device-onboarding flow (`docs/architecture.md` § Station Account Provisioning) — nothing consumes a staff PIN for login yet, since no station device exists to prompt for one.

**Pick up:** design the station account + pairing-code UI — a separate effort from the PIN storage that already shipped.

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

Manage Staff, Manage Menu, Manage Tables & QR Codes, Update Order Status, and every Bills action now have per-role gating matching `docs/product.md`'s RBAC matrix:

- **Menu Desk / Table Matrix** (`menu/layout.tsx`, `tables/layout.tsx`): Owner/Manager/Admin only, both at the page and the RLS layer (`staff_write_menu_*`/`staff_write_restaurant_tables`, `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 5). "Update Item Availability" stays open to any active staff via `set_menu_item_availability` (§ 7 of that migration) — the one carve-out, since Waiter/Kitchen keep that action per the matrix.
- **Kitchen** (`kitchen.ts` `advanceBatch`): Kitchen/Manager/Owner/Admin only — Waiter views the queue but can't advance it.
- **Bills** (`bills/layout.tsx`, `bills.ts`): every write excludes Kitchen; `closeSession`'s role check lives inside `close_session()` itself.
- **Venue Settings** (`settings/layout.tsx`, `restaurants.ts` `updateOwn`): Owner/Admin only, narrower than every other gate above — Manager is excluded, both at the page and inside `owner_update_restaurant` itself.

Not yet split: **View Analytics** — the page doesn't exist yet, so there's nothing to gate.

**Pick up:** apply the same per-`staff.role` pattern to an Analytics page once it gets built.

---

## Owner reassignment

Shipped: `reassign_primary_owner` (`supabase/migrations/20260816164344_add_staff_roster_rpcs.sql` § 15c) hands `is_primary_owner` to another existing Owner-role staff row — a pure handoff, not a demotion, both rows stay `role = 'owner'` — Staff Roster's "Make Primary Owner" row action, shown only on Owner-role rows (a Waiter/Manager/Kitchen must be promoted to Owner via `update_staff` first). A role downgrade for the outgoing owner is a separate `update_staff`/Edit Staff action the caller takes afterward if they want one, not part of this RPC. Caller must be the current primary owner themselves or Dineinly Admin — stricter than any Owner-role staff, since a non-primary co-owner can't transfer someone else's ownership. `update_staff`/`remove_staff` still reject the primary owner row directly (edit/remove never touch it); reassignment is the only path.

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

## No Call Waiter action on the bill

The guest bill screen (`apps/web/app/guest/bill/page.tsx`) has no way to summon staff — no mutation, no realtime notification to the floor.

**Pick up:** the realtime Broadcast infra now exists (`session:{id}`/`restaurant:{id}` topics, `apps/web/lib/realtime/`) and the Floor page now exists (`apps/web/app/restaurants/[restaurantId]/floor`) — this only needs a mutation plus a decision on what the notification looks like there.

---

## No Email Bill action

The guest bill screen has no way to email/export the bill — no guest email capture anywhere in the guest flow (guests never have accounts, per AGENTS.md), no email-sending integration.

**Pick up:** decide how a guest supplies an email (one-off field on the bill screen vs. something persisted) and which email provider to use — not decided yet, don't guess either.

---

## No DB-level test coverage for RPCs

Every test in `apps/web/tests/` is a mocked unit test (`ctx.auth`/`ctx.supabase` stubbed) — nothing runs a Postgres function against a real Postgres and checks what it actually returns. Two Critical bugs shipped past typecheck + the full unit suite during the station PIN login work because of exactly this gap: an RLS policy that was too permissive, and an RPC returning a shape its caller didn't handle. Both were only caught by hand-testing against the local DB.

**Pick up:** Supabase CLI has this built in — no new framework to evaluate. `supabase test new <name>` scaffolds a pgTAP file under `supabase/tests/database/`; `supabase test db` spins up a fresh shadow DB, replays every migration, and runs them. Start with the two bug classes that already bit us:

- **RLS**: `tests.create_supabase_user()` / `tests.authenticate_as()` (pgTAP helpers Supabase ships) to assert a policy blocks the cross-tenant/cross-role case it's supposed to block, not just that it allows the intended one.
- **RPC return shape**: call each SECURITY DEFINER function directly (`select * from public.some_rpc(...)`) and assert on the columns/types actually returned, not just that it doesn't error — a mismatch between what the RPC returns and what the TS caller destructures is invisible to `tsc` since `database.types.ts` is generated *from* the RPC, not checked against a spec.

Prioritize the RPCs with the most callers and the least obvious failure mode first: `resolve_staff_by_pin`, `resolve_staff_signin`, `staff_submit_order`/`submit_order`, `claim_station_staff`. No CI wiring decision needed yet — get the local `supabase test db` loop working first.
