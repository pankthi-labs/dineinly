# TBD

Deferred work, tracked in one place. Each entry: what's missing, why it's deferred, where to pick it up.

---

## PIN station login for Kitchen/Floor

Not implemented. Only Owner/Manager email OTP exists (`apps/web/app/sign-in/`). `docs/architecture.md` requires a shared station account + app-level PIN for Kitchen/Floor — no PIN storage, verification, or UI anywhere in the codebase.

**Pick up:** design PIN hash storage + verification alongside the Staff Roster work (see below) — station account is a Staff concept.

---

## Post-login redirect is hardcoded to /admin

`apps/web/app/sign-in/sign-in-form.tsx`'s `attemptLink()` sends every successful sign-in to `/admin` regardless of role. `linkStaffAccount`'s `linked` result (restaurant/staff/role) is available but unused for routing.

**Pick up:** once a restaurant home page exists, branch the redirect off `linkStaffAccount`'s result — Dineinly Admin to `/admin`, linked Owner/Manager to their restaurant.

---

## No app-level OTP rate limiting

No lockout after N failed OTP attempts, no app-level throttling on `resolveSignIn` or `verifyOtp` (`apps/web/server/routers/auth.ts`). Relies entirely on Supabase GoTrue's own defaults.

**Pick up:** decide the lockout policy (attempts, window, cooldown) before implementing — don't guess a number.

---

## No invite-expiry concept

An `invited` Staff row never expires (`packages/db/src/schema/staff.ts`). Sign-in can't distinguish "your invite expired" from any other failure — all collapse to the generic `SEND_FAILED_MESSAGE` by design (see comment at `apps/web/app/sign-in/sign-in-form.tsx`).

**Pick up:** decide whether invites should expire and after how long before adding an `invited_at`/expiry column and differentiated messaging.

---

## Staff RLS not implemented

`requireRestaurantAccess` (`apps/web/lib/auth.ts`) is a stub that just delegates to `requireAdmin` — there's no RLS yet for a linked Staff row to reach its own restaurant. Noted in the function's own doc comment.

**Pick up:** implement alongside Staff Roster functionality — this is the same effort as owner reassignment (`docs/core-data-model.md`: "Reassigning the primary owner ... is a Staff Roster capability (not yet built)").

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

**Pick up:** depends on the guest-facing menu UI existing first — revisit once that's built.
