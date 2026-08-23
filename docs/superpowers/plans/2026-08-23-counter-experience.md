# Dineinly Counter Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dineinly Counter experience end to end: guest scans a universal (non-table) QR, orders, gets a bill token on confirm, pays at the counter, staff marks the bill settled which unblocks the kitchen, kitchen prepares and marks items ready, guest sees "Ready for Pickup" live, and kitchen marks the item picked up.

**Architecture:** Counter reuses every existing Full-Service primitive (guest JWT/session, `orders`/`order_items`/`bills`, the `session:{id}`/`restaurant:{id}` realtime channels, the Bills tab, the Kitchen Display) with three structural deltas already decided in the docs: (1) Counter has zero `restaurant_tables` rows — its QR lives on a new `restaurants.counter_qr_token` column and always mints a fresh, tableless `table_sessions` row, never joins one; (2) `submit_order()` also draws the bill token immediately for counter sessions, so the guest never needs a separate Request Bill tap; (3) the kitchen's `placed → preparing` transition is blocked until the session's bill is `settled` (already shipped). No new tables, no new routers — extends `restaurants`, `guest`, `kitchen` and adds one small `counterQr` sub-router.

**Tech Stack:** Next.js 16 (App Router) + tRPC + Supabase (Postgres/PostgREST/Realtime) + Drizzle (schema authoring only) + Zod + Vitest.

**Spec:** `docs/product.md` § Dineinly Experiences / § Billing & Settlement, `docs/core-data-model.md` § Experience Gating / § Lifecycle invariants, `docs/architecture.md` § Route Structure / § Authorization & Idempotency — these three sections already fully specify Counter's data model and RPC contracts; this plan implements them as written. No separate spec doc was written (architecture pre-exists in the docs above).

## Global Constraints

- Pre-launch, no production data: every schema/RPC change is hand-folded into the **original** migration file that first created that table/function — never a new incremental migration file. `supabase/migrations/20260730150628_init_schema.sql` (schema) and `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` (all RPCs touched here) are both original files; edit them in place, then update every `supabase/migrations/meta/*_snapshot.json` from the edited migration onward, then `supabase db reset` and confirm `drizzle-kit generate` produces nothing.
- No payments processing — Counter settlement is still external; Dineinly only marks the bill settled (existing Bills tab action, untouched).
- Client-side checks are UX only — every gate added here has (or already has) a server-side twin.
- No UI component library, dark-only, design-system tokens only (`docs/design-system.md`) for any new markup.
- Never start the dev server, take screenshots, or run Playwright — verify with `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `supabase db reset` only.
- Out of scope (explicitly, to avoid scope creep): hiding Table Matrix/Floor nav for Counter restaurants, `staff_submit_order` (staff-placed orders) for Counter, any new push-notification mechanism — the existing `session:{id}`/`restaurant:{id}` broadcast channels already carry every realtime update this feature needs.

---

### Task 1: `counter_qr_token` column + provisioning + regenerate RPCs

**Files:**
- Modify: `packages/db/src/schema/restaurant.ts`
- Modify: `supabase/migrations/20260730150628_init_schema.sql` (restaurants table DDL, ~line 171)
- Modify: `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` (`admin_create_restaurant` ~line 614-628, `ensure_menu_qr_table` ~line 688-705, `admin_update_restaurant` ~line 747-774, `owner_update_restaurant` ~line 825-839)
- Modify: `supabase/migrations/meta/20260730150628_snapshot.json`, `20260730150634_snapshot.json`, `20260816164344_snapshot.json`, `20260820070301_snapshot.json`

**Interfaces:**
- Produces: `restaurants.counter_qr_token` (text, nullable, unique) column; `public.ensure_counter_qr_token(p_restaurant_id uuid) returns void` and `public.regenerate_counter_qr_token(p_restaurant_id uuid) returns text` SQL functions, both granted to `authenticated`.

- [ ] **Step 1: Add the column to the Drizzle schema**

In `packages/db/src/schema/restaurant.ts`, add the import and column (mirrors `experience`'s placement, right after it):

```typescript
import { sql } from "drizzle-orm";
import { check, numeric, pgTable, text, unique } from "drizzle-orm/pg-core";
```

Add the column inside the `pgTable` definition, after `experience`:

```typescript
		experience: restaurantExperience("experience").notNull().default("one"),
		// Counter's universal QR (docs/core-data-model.md § Experience Gating).
		// Null for every other experience — set only by ensure_counter_qr_token()
		// the moment a restaurant becomes counter-experience. Unlike
		// Restaurant Table.qr_token, resolving this token never looks up an
		// existing session — it always creates one (see resolve_qr_token()).
		counterQrToken: text("counter_qr_token").unique(),
```

- [ ] **Step 2: Add the column to the original init migration**

In `supabase/migrations/20260730150628_init_schema.sql`, edit the `CREATE TABLE "restaurants"` block (~line 171-185):

```sql
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"gst_number" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"service_charge_rate" numeric(5, 4),
	"status" "restaurant_status" DEFAULT 'active' NOT NULL,
	"experience" "restaurant_experience" DEFAULT 'one' NOT NULL,
	"counter_qr_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_service_charge_rate_check" CHECK ("restaurants"."service_charge_rate" between 0 and 1),
	CONSTRAINT "restaurants_counter_qr_token_unique" UNIQUE("counter_qr_token")
);
```

- [ ] **Step 3: Add `ensure_counter_qr_token()`, mirroring `ensure_menu_qr_table()`**

In `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql`, immediately after the `ensure_menu_qr_table` function definition (after its `grant execute` line, ~line 705), add:

```sql
-- Shared by admin_create_restaurant and both update RPCs below, called only
-- when p_experience = 'counter'. Idempotent, same reasoning as
-- ensure_menu_qr_table: a restaurant that already has a token (its own, or
-- from a prior stint on Counter) keeps it — switching Counter -> another
-- experience -> Counter again reuses the same QR instead of alternating
-- tokens (any printed/laminated counter QR keeps working).
create or replace function public.ensure_counter_qr_token(p_restaurant_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
	update public.restaurants
	set counter_qr_token = gen_random_uuid()::text
	where id = p_restaurant_id and counter_qr_token is null;
end;
$$;

revoke execute on function public.ensure_counter_qr_token(uuid) from public;
grant execute on function public.ensure_counter_qr_token(uuid) to authenticated;

-- Counter QR "Regenerate" (Task 6's counterQr.regenerate). SECURITY DEFINER
-- for the same reason as owner_update_restaurant just above it: restaurants
-- only has a write policy for Dineinly Admin (admin_all_restaurants) — a
-- plain Owner has row-level SELECT only (staff_select_own_restaurant), so an
-- invoker-mode UPDATE would silently affect 0 rows for that caller. The
-- explicit role check below is what makes bypassing RLS here safe, same
-- pattern as every staff-roster write RPC.
create or replace function public.regenerate_counter_qr_token(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token text;
begin
	if not (
		public.is_dineinly_admin()
		or public.staff_role_for_restaurant(p_restaurant_id) = 'owner'
	) then
		raise exception 'Only the restaurant owner may regenerate this QR code';
	end if;

	update public.restaurants
	set counter_qr_token = gen_random_uuid()::text
	where id = p_restaurant_id
	returning counter_qr_token into v_token;

	if v_token is null then
		raise exception 'Restaurant not found';
	end if;

	return v_token;
end;
$$;

revoke execute on function public.regenerate_counter_qr_token(uuid) from public;
grant execute on function public.regenerate_counter_qr_token(uuid) to authenticated;
```

- [ ] **Step 4: Wire the call into all three restaurant create/update RPCs**

In the same file, `admin_create_restaurant` (~line 626-628), change:

```sql
	if p_experience = 'menu' then
		perform public.ensure_menu_qr_table(v_restaurant_id);
	end if;
```

to:

```sql
	if p_experience = 'menu' then
		perform public.ensure_menu_qr_table(v_restaurant_id);
	elsif p_experience = 'counter' then
		perform public.ensure_counter_qr_token(v_restaurant_id);
	end if;
```

Apply the identical `elsif` addition in `admin_update_restaurant` (~line 772-774) and `owner_update_restaurant` (~line 837-839) — both currently have the same `if p_experience = 'menu' then perform public.ensure_menu_qr_table(p_id); end if;` shape.

- [ ] **Step 5: Update the four snapshot files**

For each of `supabase/migrations/meta/20260730150628_snapshot.json`, `20260730150634_snapshot.json`, `20260816164344_snapshot.json`, `20260820070301_snapshot.json`: open the file, find `"tables"."public.restaurants"."columns"`, and insert a `counter_qr_token` entry immediately after `"experience"`:

```json
    "counter_qr_token": {
      "name": "counter_qr_token",
      "type": "text",
      "primaryKey": false,
      "notNull": false
    },
```

Then, in the same table's `"uniqueConstraints"` object (create it as `{}` if absent, mirroring `restaurant_tables`'s shape read during planning), add:

```json
    "restaurants_counter_qr_token_unique": {
      "name": "restaurants_counter_qr_token_unique",
      "nullsNotDistinct": false,
      "columns": [
        "counter_qr_token"
      ]
    }
```

Do not touch each snapshot's own top-level `"id"`/`"prevId"` — the migration chain must stay linked exactly as it is.

- [ ] **Step 6: Verify no drift**

Run: `supabase db reset`
Expected: succeeds, no errors.

Run: `cd packages/db && pnpm exec drizzle-kit generate`
Expected: "No schema changes, nothing to migrate" (or equivalent) — proves `schema.ts` and the snapshot chain agree with no new file needed. If it generates a file, fold its `ALTER TABLE`/constraint into Step 2/3 above instead and delete the generated file + its journal entry.

Manually confirm both new functions exist via `psql`/SQL editor against the reset DB:

```sql
select proname from pg_proc where proname in ('ensure_counter_qr_token', 'regenerate_counter_qr_token');
```
Expected: both rows present.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/restaurant.ts supabase/migrations/20260730150628_init_schema.sql supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql supabase/migrations/meta/*.json packages/db/src/database.types.ts
git commit -m "feat(counter): add counter_qr_token column and ensure_counter_qr_token()"
```

(`database.types.ts` regenerates from `supabase db reset`'s local Postgres via the project's existing type-gen script — run whatever `pnpm --filter @workspace/db` script this repo already uses for that, matching how `experience` was type-gen'd; check `packages/db/package.json` for the exact script name.)

---

### Task 2: `resolve_qr_token()` — counter branch, tableless session

**Files:**
- Modify: `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` (`resolve_qr_token`, ~line 968-1014)

**Interfaces:**
- Consumes: `restaurants.counter_qr_token` (Task 1).
- Produces: `resolve_qr_token(p_qr_token text)` now returns `table_label text` as **nullable** (was effectively always non-null before) — `apps/web/app/qr/[qrToken]/route.ts` and everything downstream (Task 4) must treat it as `string | null`.

- [ ] **Step 1: Replace the function body**

Replace the whole `create or replace function public.resolve_qr_token(...)` block (~line 968-1014) with:

```sql
create or replace function public.resolve_qr_token(p_qr_token text)
returns table (
	restaurant_id uuid,
	table_session_id uuid,
	table_label text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_table_id uuid;
	v_restaurant_id uuid;
	v_label text;
	v_session_id uuid;
	v_session_status public.session_status;
begin
	select rt.id, rt.restaurant_id, rt.label, rt.session_id
	into v_table_id, v_restaurant_id, v_label, v_session_id
	from public.restaurant_tables rt
	where rt.qr_token = p_qr_token
		and rt.status = 'active'
	for update;

	if v_table_id is not null then
		if v_session_id is not null then
			select ts.status into v_session_status
			from public.table_sessions ts
			where ts.id = v_session_id;
		end if;

		if v_session_id is null or v_session_status <> 'active' then
			insert into public.table_sessions (restaurant_id)
			values (v_restaurant_id)
			returning id into v_session_id;

			update public.restaurant_tables
			set session_id = v_session_id
			where id = v_table_id;
		end if;

		return query select v_restaurant_id, v_session_id, v_label;
		return;
	end if;

	-- No table QR matched — try the counter-experience universal QR
	-- (docs/core-data-model.md § Experience Gating). Unlike the table branch
	-- above, this never joins an existing session: one counter QR serves
	-- many concurrent guests, so every scan starts its own fresh, tableless
	-- session. table_sessions already has no table_id column, so no schema
	-- change is needed for this second entry path.
	select r.id into v_restaurant_id
	from public.restaurants r
	where r.counter_qr_token = p_qr_token;

	if v_restaurant_id is null then
		raise exception 'Invalid QR code';
	end if;

	insert into public.table_sessions (restaurant_id)
	values (v_restaurant_id)
	returning id into v_session_id;

	return query select v_restaurant_id, v_session_id, null::text;
end;
$$;

revoke execute on function public.resolve_qr_token(text) from public;
-- Called pre-auth (no guest JWT minted yet), so the request arrives as
-- `anon`; also grant `authenticated` for the same leftover-session-cookie
-- reason as resolve_staff_signin above.
grant execute on function public.resolve_qr_token(text) to anon, authenticated;
```

- [ ] **Step 2: Verify**

Run: `supabase db reset`
Expected: succeeds. Manually confirm via `psql` (or Supabase Studio's SQL editor, read-only check — not Studio's table editor, per AGENTS.md) against the reset local DB:

```sql
select * from public.resolve_qr_token('does-not-exist');
```
Expected: raises `Invalid QR code`.

```sql
-- seed: update a restaurant to counter and give it a token
update public.restaurants set experience = 'counter' where id = (select id from public.restaurants limit 1);
select public.ensure_counter_qr_token((select id from public.restaurants where experience = 'counter' limit 1));
select * from public.resolve_qr_token((select counter_qr_token from public.restaurants where experience = 'counter' limit 1));
```
Expected: one row, `table_label` is `null`, `table_session_id` is a fresh uuid. Run the same select again with the same token: expected a **different** `table_session_id` (never joins).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql
git commit -m "feat(counter): resolve_qr_token creates tableless sessions for counter QR"
```

---

### Task 3: `submit_order()` — auto-draw the bill for counter sessions

**Files:**
- Modify: `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` (`submit_order`, ~line 1047-1151)

**Interfaces:**
- Consumes: `restaurants.experience`, the existing `bills` table (`session_id` unique).
- Produces: no signature change — `submit_order(p_idempotency_key text) returns uuid` is unchanged; the side effect (bill drawn) is new.

- [ ] **Step 1: Add the experience lookup and bill-draw block**

In `submit_order()`, add `v_experience` to the `declare` block:

```sql
declare
	v_restaurant_id uuid;
	v_session_id uuid;
	v_order_id uuid;
	v_experience public.restaurant_experience;
```

Immediately after the `insert into public.order_items (...)` statement and its trailing `where ci.restaurant_id = v_restaurant_id and ci.session_id = v_session_id;`, and **before** the `delete from public.cart_items ...` line, insert:

```sql
	-- Counter-experience addition (docs/core-data-model.md § Lifecycle
	-- invariants): confirming the cart also draws the session's bill token
	-- immediately, so the guest sees it without a separate Request Bill tap.
	-- The settled-bill check earlier in this function already guarantees no
	-- bill on this session is 'settled' yet, so a plain upsert to
	-- 'requested' is safe with no settled-guard needed here (contrast
	-- request_bill(), which re-runs on every poll and must not un-settle).
	select experience into v_experience
	from public.restaurants
	where id = v_restaurant_id;

	if v_experience = 'counter' then
		insert into public.bills (restaurant_id, session_id, status, service_charge_rate)
		values (
			v_restaurant_id,
			v_session_id,
			'requested',
			(select service_charge_rate from public.restaurants where id = v_restaurant_id)
		)
		on conflict (session_id) do update
		set status = 'requested';
	end if;
```

- [ ] **Step 2: Verify**

Run: `supabase db reset`
Expected: succeeds.

Manual check via `psql`/SQL editor against the reset DB: create a counter-experience restaurant + guest session (reuse Task 2's seed), add a cart item as that guest (or insert directly into `cart_items`), call `submit_order()` with a fresh idempotency key, then:

```sql
select status, bill_number is not null as has_token from public.bills where session_id = '<session id>';
```
Expected: `status = 'requested'`, `has_token = true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql
git commit -m "feat(counter): submit_order draws the bill token on confirm for counter sessions"
```

---

### Task 4: Guest ordering parity — nullable table label + bill access for Counter

**Files:**
- Modify: `apps/web/lib/guest-token.ts` (`guestClaimsSchema`, ~line 35-41)
- Modify: `apps/web/server/routers/guest.ts` (`requireBillEnabled`, ~line 15-39)
- Modify: `apps/web/components/guest-page-header.tsx`
- Modify: `apps/web/app/guest/menu/page.tsx` (~line 227-231)
- Modify: `apps/web/app/guest/cart/page.tsx` (~line 105)
- Modify: `apps/web/app/guest/bill/page.tsx` (~line 86)
- Test: `apps/web/tests/lib/guest-token.test.ts` (extend existing)

**Interfaces:**
- Consumes: `resolve_qr_token()`'s nullable `table_label` (Task 2).
- Produces: `GuestClaims.table_label: string | null`; `GuestPageHeader`'s `tableLabel` prop is `string | null`.

- [ ] **Step 1: Make `table_label` nullable in the claims schema**

In `apps/web/lib/guest-token.ts`, change:

```typescript
	table_label: z.string(),
```
to:
```typescript
	// null for counter-experience sessions (docs/core-data-model.md §
	// Experience Gating) — those are tableless, so there's nothing to label.
	table_label: z.string().nullable(),
```

- [ ] **Step 2: Extend the existing guest-token test for the null case**

Open `apps/web/tests/lib/guest-token.test.ts`, find the test that mints/verifies a token with `table_label`, and add one case:

```typescript
it("round-trips a null table_label (counter-experience session)", async () => {
	const token = await mintGuestToken({
		restaurant_id: crypto.randomUUID(),
		table_session_id: crypto.randomUUID(),
		table_label: null,
		app_role: "guest",
	});
	const claims = await verifyGuestToken(token);
	expect(claims?.table_label).toBeNull();
});
```

(Match the file's existing import style and `mintGuestToken`/`verifyGuestToken` call shape exactly — read the file first, this is additive only.)

- [ ] **Step 3: Run the test, confirm it passes**

Run: `pnpm --filter web test guest-token`
Expected: PASS, including the new case.

- [ ] **Step 4: Allow Counter to reach the guest bill router**

In `apps/web/server/routers/guest.ts`, change `requireBillEnabled` (~line 32-39):

```typescript
function requireBillEnabled(experience: string): void {
	if (experience !== "one") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Billing isn't available here.",
		});
	}
}
```
to:
```typescript
function requireBillEnabled(experience: string): void {
	if (experience !== "one" && experience !== "counter") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Billing isn't available here.",
		});
	}
}
```

Also update the stale top-of-file comment (~line 15-22) that currently ends "Counter never reaches this router — it has no Restaurant Table rows, so it can't resolve through the table-QR guest session this router serves." Replace that last sentence with:

```typescript
// ordering, live status, and bill. Counter also reaches this router (its
// tableless sessions resolve through the same guest JWT/session shape —
// see resolve_qr_token()) and gets bill access too, since the bill_number
// doubles as the guest's counter token (docs/core-data-model.md).
```

- [ ] **Step 5: Make `GuestPageHeader` render without a table label**

In `apps/web/components/guest-page-header.tsx`, change the prop type and render conditionally:

```typescript
export function GuestPageHeader({
	restaurantName,
	tableLabel,
}: {
	restaurantName: string;
	tableLabel: string | null;
}) {
	return (
		<header className="flex items-center gap-4 px-5 pt-6 pb-4">
			<div className="min-w-0 flex-1">
				<h1 className="text-2xl">{restaurantName}</h1>
				<PoweredByDineinly className="mt-1" />
			</div>
			{tableLabel ? (
				<p className="shrink-0 rounded-pill border border-divider px-3 py-1 text-caps text-secondary">
					Table {tableLabel}
				</p>
			) : null}
		</header>
	);
}
```

- [ ] **Step 6: Fix the menu page's inline table chip**

In `apps/web/app/guest/menu/page.tsx` (~line 227-231), change:

```typescript
							{orderingEnabled ? (
								<p className="shrink-0 rounded-pill border border-divider px-3 py-1 text-caps text-secondary">
									Table {menu.data.tableLabel}
								</p>
							) : null}
```
to:
```typescript
							{orderingEnabled && menu.data.tableLabel ? (
								<p className="shrink-0 rounded-pill border border-divider px-3 py-1 text-caps text-secondary">
									Table {menu.data.tableLabel}
								</p>
							) : null}
```

- [ ] **Step 7: Fix the cart page's prop type**

In `apps/web/app/guest/cart/page.tsx` (~line 105), change `tableLabel: string;` to `tableLabel: string | null;` in the `GuestCartContent` props type.

- [ ] **Step 8: Fix the bill page's table line**

In `apps/web/app/guest/bill/page.tsx` (~line 82-88), change:

```typescript
						<p className="mt-1 text-caps text-muted">
							Bill #{data.billNumber} · Table {data.tableLabel}
							{data.status === "settled" ? " · Settled" : ""}
						</p>
```
to:
```typescript
						<p className="mt-1 text-caps text-muted">
							Bill #{data.billNumber}
							{data.tableLabel ? ` · Table ${data.tableLabel}` : ""}
							{data.status === "settled" ? " · Settled" : ""}
						</p>
```

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. This surfaces every remaining call site still assuming `tableLabel`/`table_label` is a required string — fix any the grep in planning missed.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/guest-token.ts apps/web/tests/lib/guest-token.test.ts apps/web/server/routers/guest.ts apps/web/components/guest-page-header.tsx apps/web/app/guest/menu/page.tsx apps/web/app/guest/cart/page.tsx apps/web/app/guest/bill/page.tsx
git commit -m "feat(counter): nullable table label end-to-end, counter reaches guest bill router"
```

---

### Task 5: Kitchen marks Counter pickups complete

**Files:**
- Modify: `apps/web/server/routers/kitchen.ts` (`serveBatch`, ~line 269-290)
- Modify: `apps/web/app/restaurants/[restaurantId]/kitchen/page.tsx` (~line 58-61)
- Modify: `apps/web/app/restaurants/[restaurantId]/viewer-context.tsx` (add `useIsCounter`, mirroring `useIsMenuOnly`)

**Interfaces:**
- Produces: `useIsCounter(): boolean` (new hook, same shape as existing `useIsMenuOnly`).

- [ ] **Step 1: Add `useIsCounter` to the viewer context**

In `apps/web/app/restaurants/[restaurantId]/viewer-context.tsx`, immediately after `useIsMenuOnly` (~line 66), add:

```typescript
// Dineinly Counter (docs/product.md § Dineinly Experiences) is
// self-service, quick-turnaround — no Waiter marks the pickup complete,
// Kitchen does (see kitchen/page.tsx's canServe). Client-side UX only —
// see kitchen.ts's serveBatch for the real, server-enforced gate.
export function useIsCounter(): boolean {
	return useRestaurantViewer().experience === "counter";
}
```

- [ ] **Step 2: Let Kitchen advance `ready → served` for counter-experience sessions**

In `apps/web/server/routers/kitchen.ts`, `serveBatch` (~line 269-290), the role check currently reads:

```typescript
			await requireFullServiceRole(ctx, input.restaurantId, [
				"waiter",
				"manager",
				"owner",
			]);
```

Change to add `kitchen` conditionally on the restaurant's experience, reusing the same pattern `assertCounterBillsSettled` already uses to read `experience`:

```typescript
			const restaurantResult = await ctx.auth
				.from("restaurants")
				.select("experience")
				.eq("id", input.restaurantId)
				.maybeSingle();
			if (restaurantResult.error) {
				throw dbError("Unable to update the order.", restaurantResult.error);
			}

			// Counter is self-service — Kitchen marks the pickup complete
			// (docs/product.md § Dineinly Experiences), unlike Full-Service where
			// only Waiter/Manager/Owner may (Kitchen never touches Serve there).
			const allowedRoles: Parameters<typeof requireFullServiceRole>[2] =
				restaurantResult.data?.experience === "counter"
					? ["kitchen", "manager", "owner"]
					: ["waiter", "manager", "owner"];

			await requireFullServiceRole(ctx, input.restaurantId, allowedRoles);
```

(Place this before the existing `return updateOrderItemsStatus(...)` call, replacing the old three-line `requireFullServiceRole` call.)

Also update the doc comment directly above `serveBatch` (~line 263-268) — it currently says unconditionally "the inverse split of advanceBatch above, which excludes Waiter... Kitchen never touches this transition at all, not even to view it as an option". Amend it:

```typescript
	// Serve Order (docs/product.md § RBAC "Serve Order (set Served)") is
	// Waiter/Manager/Owner for Full-Service — the inverse split of
	// advanceBatch above, which excludes Waiter. Ready is the only status
	// this ever moves from: Served is terminal (order-item.ts /
	// core-data-model.md lifecycle). Counter-experience restaurants swap
	// Waiter for Kitchen here (docs/product.md § Dineinly Experiences —
	// Counter is self-service, no waiter marks the pickup).
```

- [ ] **Step 3: Update the client-side `canServe` check**

In `apps/web/app/restaurants/[restaurantId]/kitchen/page.tsx`, import `useIsCounter` alongside the existing `useIsAdmin, useRestaurantRole` import (~line 17):

```typescript
import { useIsAdmin, useIsCounter, useRestaurantRole } from "../viewer-context";
```

Change the `canServe` line (~line 58-61):

```typescript
	// "Serve Order (set Served)" is the inverse split — Waiter/Manager/Owner,
	// never Kitchen. UX only — serveBatch enforces the real, server-side
	// version of this same check.
	const canServe = isAdmin || restaurantRole !== "kitchen";
```
to:
```typescript
	// "Serve Order (set Served)" is the inverse split — Waiter/Manager/Owner
	// for Full-Service, never Kitchen there. Counter swaps Kitchen in for
	// Waiter (self-service pickup, docs/product.md § Dineinly Experiences).
	// UX only — serveBatch enforces the real, server-side version.
	const isCounter = useIsCounter();
	const canServe = isAdmin || restaurantRole !== "kitchen" || isCounter;
```

Also, for Counter, the "Ready" column's button copy "Mark Served" reads oddly for a pickup counter — change it to read "Picked Up" when counter. In the same file, the `Ready` `QueueColumn`'s `renderAction` button (~line 261-293) currently hardcodes `Mark Served`. Change:

```typescript
									<button
										type="button"
										onClick={() => serve(batch)}
										disabled={serveBatch.isPending}
										className={ADVANCE_BUTTON_CLASS}
									>
										Mark Served
										<Check
```
to:
```typescript
									<button
										type="button"
										onClick={() => serve(batch)}
										disabled={serveBatch.isPending}
										className={ADVANCE_BUTTON_CLASS}
									>
										{isCounter ? "Picked Up" : "Mark Served"}
										<Check
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/restaurants/[restaurantId]/viewer-context.tsx apps/web/server/routers/kitchen.ts apps/web/app/restaurants/[restaurantId]/kitchen/page.tsx
git commit -m "feat(counter): kitchen marks counter pickups complete instead of waiter"
```

---

### Task 6: `restaurants.counterQr` sub-router

**Files:**
- Modify: `apps/web/server/routers/restaurants.schema.ts`
- Modify: `apps/web/server/routers/restaurants.ts`
- Test: `apps/web/tests/server/routers/restaurants.schema.test.ts` (extend existing)

**Interfaces:**
- Consumes: `restaurants.counter_qr_token` and the `regenerate_counter_qr_token(p_restaurant_id uuid) returns text` RPC (both Task 1), `buildTableQrPdf` (`apps/web/lib/qr-pdf.ts`, unchanged signature: `(tables: {label: string; qrToken: string}[], origin: string) => Promise<Uint8Array>`).
- Produces: `restaurants.counterQr.get`, `.regenerate`, `.downloadPdf` procedures.

Note: this task depends on `regenerate_counter_qr_token()` existing in the database, which Task 1 Step 3 (amended) creates. If executing tasks out of order, add that RPC before wiring `.regenerate` below.

- [ ] **Step 1: Add input schemas**

In `apps/web/server/routers/restaurants.schema.ts`, add (near the other `*Input` schemas — read the file first for exact placement/style, then append):

```typescript
export const getCounterQrInput = z.object({
	restaurantId: z.string().uuid(),
});

export const downloadCounterQrPdfInput = z.object({
	restaurantId: z.string().uuid(),
	origin: z.string().url(),
});
```

- [ ] **Step 2: Write a schema test for the new inputs**

In `apps/web/tests/server/routers/restaurants.schema.test.ts`, add (matching the file's existing `describe`/`it` structure exactly — read it first):

```typescript
describe("getCounterQrInput", () => {
	it("accepts a valid restaurant id", () => {
		expect(
			getCounterQrInput.safeParse({ restaurantId: crypto.randomUUID() })
				.success,
		).toBe(true);
	});

	it("rejects a non-uuid restaurant id", () => {
		expect(getCounterQrInput.safeParse({ restaurantId: "nope" }).success).toBe(
			false,
		);
	});
});
```

- [ ] **Step 3: Run the test, confirm it fails (import not yet exported from a router)**

Run: `pnpm --filter web test restaurants.schema`
Expected: FAIL — `getCounterQrInput is not defined` (test file imports it before Step 1's export exists, if written first; if Step 1 is already done, this instead just passes — either order is fine, this is schema validation, not RPC behavior, so there's no meaningful "red" state to chase here beyond a typo check).

- [ ] **Step 4: Run again to confirm it passes**

Run: `pnpm --filter web test restaurants.schema`
Expected: PASS.

- [ ] **Step 5: Add the `counterQr` sub-router**

In `apps/web/server/routers/restaurants.ts`, add the import:

```typescript
import {
	createRestaurantInput,
	downloadCounterQrPdfInput,
	getCounterQrInput,
	getRestaurantInput,
	listRestaurantsInput,
	setRestaurantStatusInput,
	updateOwnRestaurantInput,
	updateRestaurantInput,
} from "./restaurants.schema";
```

and add `buildTableQrPdf`'s import (mirrors `tables.ts`):

```typescript
import { buildTableQrPdf } from "@/lib/qr-pdf";
```

Add a `counterQr` nested router as a new property on `restaurantsRouter` (after `setStatus`, before the closing `});`):

```typescript
	counterQr: router({
		// Read + regenerate/download reuse the Owner+Admin gate every other
		// Venue Settings write uses (RLS: staff_select_own_restaurant lets any
		// staff read; the role check below narrows to Owner, matching
		// getSettings above) — this is Venue Settings surface, not the
		// broader authedProcedure reach tables.ts uses.
		get: authedProcedure.input(getCounterQrInput).query(async ({ ctx, input }) => {
			const {
				data: { user },
			} = await ctx.auth.auth.getUser();

			if (!isDineinlyAdmin(user)) {
				const { data: role } = await ctx.auth.rpc("staff_role_for_restaurant", {
					p_restaurant_id: input.restaurantId,
				});
				if (role !== "owner") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Only the restaurant owner may view this QR code.",
					});
				}
			}

			const { data, error } = await ctx.auth
				.from("restaurants")
				.select("counter_qr_token")
				.eq("id", input.restaurantId)
				.maybeSingle();

			if (error) {
				throw toTRPCError(error, "Unable to load the counter QR code.");
			}

			return { qrToken: data?.counter_qr_token ?? null };
		}),

		// Rotates the token in place — same "old printed QR stops working
		// immediately" behavior as tables.regenerateQr (docs/product.md §
		// Onboarding & Setup). Delegates to regenerate_counter_qr_token()
		// (SECURITY DEFINER) rather than a direct table update: restaurants
		// only grants Owners row-level SELECT via RLS (staff_select_own_
		// restaurant), not UPDATE — same reasoning as owner_update_restaurant,
		// see that RPC's comment in the migration.
		regenerate: authedProcedure
			.input(getCounterQrInput)
			.mutation(async ({ ctx, input }) => {
				const { data, error } = await ctx.auth.rpc(
					"regenerate_counter_qr_token",
					{ p_restaurant_id: input.restaurantId },
				);

				if (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: error.message,
						cause: error,
					});
				}

				return { qrToken: data };
			}),

		downloadPdf: authedProcedure
			.input(downloadCounterQrPdfInput)
			.query(async ({ ctx, input }) => {
				const { data, error } = await ctx.auth
					.from("restaurants")
					.select("name, counter_qr_token")
					.eq("id", input.restaurantId)
					.maybeSingle();

				if (error) {
					throw toTRPCError(error, "Unable to load the restaurant.");
				}
				if (!data?.counter_qr_token) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No counter QR code for this restaurant.",
					});
				}

				const pdf = await buildTableQrPdf(
					[{ label: "Counter", qrToken: data.counter_qr_token }],
					input.origin,
				);

				return {
					fileName: `${data.name.replace(/[^a-zA-Z0-9-]+/g, "-")}-counter-qr.pdf`,
					base64: Buffer.from(pdf).toString("base64"),
				};
			}),
	}),
```

- [ ] **Step 6: Typecheck, lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/server/routers/restaurants.schema.ts apps/web/server/routers/restaurants.ts apps/web/tests/server/routers/restaurants.schema.test.ts
git commit -m "feat(counter): add restaurants.counterQr get/regenerate/downloadPdf"
```

---

### Task 7: Counter QR section on Venue Settings

**Files:**
- Create: `apps/web/app/restaurants/[restaurantId]/settings/counter-qr-section.tsx`
- Modify: `apps/web/app/restaurants/[restaurantId]/settings/page.tsx`

**Interfaces:**
- Consumes: `trpc.restaurants.counterQr.{get,regenerate,downloadPdf}` (Task 6), `useIsCounter` (Task 5), `QrModal`/`RegenerateConfirmDialog` (`../tables/qr-modal`, `../tables/regenerate-confirm-dialog` — same imports `qr-code-section.tsx` already uses), `downloadPdf` (`@/lib/download-pdf`).

- [ ] **Step 1: Create the section component**

Mirror `apps/web/app/restaurants/[restaurantId]/settings/qr-code-section.tsx` structure exactly, swapping the `tables.*` calls for `counterQr.*` and dropping the table-row fetch (the QR token comes straight from `counterQr.get`, no `tables.list` needed):

```typescript
"use client";

import { useState } from "react";
import type { ToastState } from "@/components/toast";
import { downloadPdf } from "@/lib/download-pdf";
import { trpc } from "@/lib/trpc-client";
import { QrModal } from "../tables/qr-modal";

// Dineinly Counter has no Table Matrix either (docs/product.md § Dineinly
// Experiences — zero Restaurant Table rows) — this is the Owner's only QR,
// provisioned automatically (ensure_counter_qr_token,
// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql) the
// moment the restaurant becomes Counter. Unlike Menu's QR, this one never
// joins an existing session on scan — every scan starts a fresh order.
export function CounterQrSection({
	restaurantId,
	onToast,
}: {
	restaurantId: string;
	onToast: (toast: ToastState) => void;
}) {
	const [showQr, setShowQr] = useState(false);
	const [isDownloading, setIsDownloading] = useState(false);

	const utils = trpc.useUtils();
	const qrQuery = trpc.restaurants.counterQr.get.useQuery({ restaurantId });

	const regenerateMutation = trpc.restaurants.counterQr.regenerate.useMutation({
		onSuccess: () => {
			utils.restaurants.counterQr.get.invalidate({ restaurantId });
			onToast({ message: "QR code regenerated.", tone: "success" });
		},
		onError: (error) => {
			onToast({ message: error.message, tone: "error" });
		},
	});

	async function handleDownloadPdf() {
		setIsDownloading(true);
		try {
			const result = await utils.restaurants.counterQr.downloadPdf.fetch({
				restaurantId,
				origin: window.location.origin,
			});
			downloadPdf(result.fileName, result.base64);
		} catch (error) {
			onToast({
				message:
					error instanceof Error
						? error.message
						: "Unable to download the QR code.",
				tone: "error",
			});
		} finally {
			setIsDownloading(false);
		}
	}

	if (qrQuery.isPending) {
		return (
			<div className="skeleton mt-8 h-32 max-w-2xl rounded-xl border border-divider" />
		);
	}

	if (!qrQuery.data?.qrToken) return null;

	return (
		<div className="mt-8 max-w-2xl rounded-xl border border-divider bg-surface p-6">
			<h2 className="text-lg text-primary">QR Code</h2>
			<p className="mt-2 text-secondary text-sm">
				One QR for the counter — every scan starts a new order, guests pay
				with the bill number it gives them.
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-caps">
				<button
					type="button"
					onClick={() => setShowQr(true)}
					className="text-accent hover:opacity-80"
				>
					Show QR
				</button>
				<button
					type="button"
					onClick={() => regenerateMutation.mutate({ restaurantId })}
					disabled={regenerateMutation.isPending}
					className="text-secondary hover:text-primary"
				>
					Regenerate
				</button>
			</div>

			{showQr ? (
				<QrModal
					label="Counter QR Code"
					qrToken={qrQuery.data.qrToken}
					onClose={() => setShowQr(false)}
					onDownloadPdf={handleDownloadPdf}
					isDownloading={isDownloading}
				/>
			) : null}
		</div>
	);
}
```

(Note: Regenerate here has no confirm dialog, unlike `qr-code-section.tsx`'s table QR — the table version guards against orphaning an occupied table's printed QR mid-session; a counter QR never has that risk since it never binds to a session. If you'd rather match the confirm-dialog UX exactly for consistency, reuse `RegenerateConfirmDialog` the same way `qr-code-section.tsx` does — either is acceptable, pick consistency with the existing Menu section unless the user says otherwise when reviewing.)

- [ ] **Step 2: Mount it on the settings page**

In `apps/web/app/restaurants/[restaurantId]/settings/page.tsx`, import `useIsCounter` and `CounterQrSection` alongside the existing `useIsMenuOnly`/`QrCodeSection` imports:

```typescript
import { useIsCounter, useIsMenuOnly } from "../viewer-context";
import { CounterQrSection } from "./counter-qr-section";
import { QrCodeSection } from "./qr-code-section";
```

Add the hook call next to `isMenuOnly` (~line 17):

```typescript
	const isMenuOnly = useIsMenuOnly();
	const isCounter = useIsCounter();
```

Change the conditional render block (~line 86-88):

```typescript
				{isMenuOnly ? (
					<QrCodeSection restaurantId={restaurantId} onToast={setToast} />
				) : null}
```
to:
```typescript
				{isMenuOnly ? (
					<QrCodeSection restaurantId={restaurantId} onToast={setToast} />
				) : null}
				{isCounter ? (
					<CounterQrSection restaurantId={restaurantId} onToast={setToast} />
				) : null}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/restaurants/[restaurantId]/settings/counter-qr-section.tsx apps/web/app/restaurants/[restaurantId]/settings/page.tsx
git commit -m "feat(counter): show the counter QR on Venue Settings"
```

---

### Task 8: Guest "Ready for Pickup" status for Counter

**Files:**
- Modify: `apps/web/server/routers/guest.ts` (`orders.list`, ~line 222-288)
- Modify: `apps/web/app/guest/orders/page.tsx`

**Interfaces:**
- Consumes: `trpc.guest.menu.useQuery().data.restaurant.experience` (already returned).
- Produces: `guest.orders.list` item shape gains `ready: boolean` alongside the existing `served: boolean`.

- [ ] **Step 1: Expose the ready flag from the router**

In `apps/web/server/routers/guest.ts`, `orders.list` (~line 264-287), the item mapper currently returns:

```typescript
					items: items.map((item) => ({
						name: item.item_name,
						quantity: item.quantity - item.cancelled_quantity,
						served: item.status === "served",
					})),
```

Change to:

```typescript
					items: items.map((item) => ({
						name: item.item_name,
						quantity: item.quantity - item.cancelled_quantity,
						served: item.status === "served",
						// Counter-only distinction (docs/core-data-model.md §
						// Lifecycle invariants: "Counter shows its own mapping, e.g.
						// Preparing -> Ready for Pickup") — Full-Service ignores this
						// and keeps grouping purely on `served`.
						ready: item.status === "ready",
					})),
```

Also update the `status` computation just above it (~line 269-274), which currently only counts `served`:

```typescript
				const servedCount = items.filter(
					(item) => item.status === "served",
				).length;
```

leave this as-is — it already only feeds the Full-Service ladder (`status: "served" | "partially served" | "preparing"` returned alongside `items`), which Task 2 below leaves untouched for the `"one"` experience. Counter's page will derive its own two-state label client-side from the new `ready`/`served` item flags instead of this order-level `status`.

- [ ] **Step 2: Update the guest orders page's types and grouping**

In `apps/web/app/guest/orders/page.tsx`:

Change the `GuestOrder` type (~line 17-22):

```typescript
type GuestOrder = {
	id: string;
	number: number;
	status: "preparing" | "partially served" | "served";
	items: { name: string; quantity: number; served: boolean }[];
};
```
to:
```typescript
type GuestOrder = {
	id: string;
	number: number;
	status: "preparing" | "partially served" | "served";
	items: { name: string; quantity: number; served: boolean; ready: boolean }[];
};
```

Change `orderGroups` (~line 54-75) to take the experience-aware "done" predicate and label set:

```typescript
type OrderGroup = {
	key: string;
	number: number;
	status: "preparing" | "done";
	items: { name: string; quantity: number }[];
};

function orderGroups(order: GuestOrder, isCounter: boolean): OrderGroup[] {
	const isDone = (item: GuestOrder["items"][number]) =>
		isCounter ? item.served || item.ready : item.served;
	const preparing = order.items.filter((item) => !isDone(item));
	const done = order.items.filter((item) => isDone(item));
	const groups: OrderGroup[] = [];
	if (preparing.length > 0) {
		groups.push({
			key: `${order.id}-preparing`,
			number: order.number,
			status: "preparing",
			items: preparing,
		});
	}
	if (done.length > 0) {
		groups.push({
			key: `${order.id}-done`,
			number: order.number,
			status: "done",
			items: done,
		});
	}
	return groups;
}
```

Update the label/color maps (~line 36-52) to key on `"preparing" | "done"` and branch label text on experience:

```typescript
const GROUP_LABEL: Record<"one" | "counter", Record<OrderGroup["status"], string>> = {
	one: { preparing: "Preparing", done: "Served" },
	counter: { preparing: "Preparing", done: "Ready for Pickup" },
};

// Same semantic pairing as the staff Kitchen Display (preparing = Amber,
// ready/served = Green) so the two colors mean the same thing on both sides
// of the pass (docs/design-system.md §06).
const GROUP_DOT_CLASS: Record<OrderGroup["status"], string> = {
	preparing: "bg-warning",
	done: "bg-success",
};

const GROUP_TEXT_CLASS: Record<OrderGroup["status"], string> = {
	preparing: "text-warning",
	done: "text-success",
};
```

Update `billEnabled` (~line 89) to include counter:

```typescript
	const billEnabled =
		menu.data?.restaurant.experience === "one" ||
		menu.data?.restaurant.experience === "counter";
```

Update the render call site (~line 172-177) to pass experience through and use the new group shape:

```typescript
				) : billEnabled ? (
					<div className="mt-6 flex flex-col gap-6">
						{items
							.flatMap((order) =>
								orderGroups(order, menu.data.restaurant.experience === "counter"),
							)
							.map((group) => (
								<OrderGroupCard
									key={group.key}
									group={group}
									experience={
										menu.data.restaurant.experience === "counter"
											? "counter"
											: "one"
									}
								/>
							))}
					</div>
				) : (
```

Update `OrderGroupCard` (~line 265-310) to accept and use `experience`:

```typescript
function OrderGroupCard({
	group,
	experience,
}: {
	group: OrderGroup;
	experience: "one" | "counter";
}) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className="border-divider border-b pb-6">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				aria-expanded={expanded}
				className="-my-2 flex w-full items-center justify-between gap-4 py-2 text-left"
			>
				<h3 className="text-lg text-primary">
					Order {group.number} · {group.items.length}{" "}
					{group.items.length === 1 ? "item" : "items"}
				</h3>
				<ChevronDown
					className={`icon-sm shrink-0 text-secondary transition-transform duration-(--duration-base) ease-out ${expanded ? "rotate-180" : ""}`}
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			</button>
			<p className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className={`h-2 w-2 shrink-0 rounded-full ${GROUP_DOT_CLASS[group.status]}`}
				/>
				<span className={`text-caps ${GROUP_TEXT_CLASS[group.status]}`}>
					{GROUP_LABEL[experience][group.status]}
				</span>
			</p>

			{expanded ? (
				<div className="mt-4 flex flex-col gap-3 border-divider border-t pt-4">
					{group.items.map((item, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: no stable id — list is never reordered/edited
							key={index}
							className="text-base text-primary"
						>
							{item.quantity}x {titleCase(item.name)}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/routers/guest.ts apps/web/app/guest/orders/page.tsx
git commit -m "feat(counter): guest sees Ready for Pickup the moment kitchen marks an item ready"
```

---

## Final Verification (all tasks)

- [ ] Run: `supabase db reset` — full migration chain applies cleanly end to end.
- [ ] Run: `cd packages/db && pnpm exec drizzle-kit generate` — produces nothing (schema.ts and snapshots agree).
- [ ] Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green.
- [ ] Manual end-to-end trace against the reset local DB (no dev server / browser, per AGENTS.md — SQL only): flip a restaurant to `counter` via `owner_update_restaurant`, confirm `counter_qr_token` gets set; call `resolve_qr_token` with that token twice, confirm two distinct tableless sessions; insert a cart item and call `submit_order`, confirm the bill is `requested` with a `bill_number`; call `kitchen`'s `advanceBatch` to `preparing` before settling, confirm it's rejected; mark the bill `settled` (existing `bills` update path), retry `advanceBatch`, confirm it now succeeds; advance to `ready`, then call `serveBatch` as a `kitchen`-role staff row, confirm it succeeds (would fail pre-Task-5).
