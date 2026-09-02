-- Custom SQL migration file, put your code below! --

-- ============================================================================
-- 1. FK to Supabase's own auth.users
-- ============================================================================
-- Hand-written, not Drizzle-generated. See AGENTS.md / docs/architecture.md
-- § Data: external Supabase schemas (auth, storage, realtime, ...) are
-- never modeled as Drizzle-managed tables — `drizzle-kit generate` diffs
-- the TS schema graph, not the live DB, so a typed `.references()` stub
-- for auth.users would make it treat that table as ours to manage and
-- emit DDL that creates or drops Supabase's own `auth.users`. The FK is
-- added here instead, by hand. See packages/db/src/schema/staff.ts for
-- the column.
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey"
	FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

-- ============================================================================
-- 2. Enable RLS, deny-all
-- ============================================================================
-- AGENTS.md: "Tenant isolation is mandatory — every tenant-facing table has
-- RLS". Policies (guest JWT claims, staff role checks) are a separate piece
-- of work — see docs/architecture.md and docs/realtime.md. Until then this
-- is the safe default: the postgres superuser (seed.sql, DATABASE_URL) still
-- bypasses RLS, but the anon/authenticated roles can read and write nothing.

alter table "restaurants" enable row level security;
alter table "staff" enable row level security;
alter table "restaurant_tables" enable row level security;
alter table "sessions" enable row level security;
alter table "menu_categories" enable row level security;
alter table "menu_items" enable row level security;
alter table "menu_labels" enable row level security;
alter table "cart_items" enable row level security;
alter table "orders" enable row level security;
alter table "order_items" enable row level security;
alter table "bills" enable row level security;
alter table "restaurant_daily_tokens" enable row level security;

-- ============================================================================
-- 3. Guest RLS: read access (menu, own session, own orders/bill) plus cart
--    writes (Add to Cart, per docs/product.md RBAC — the only guest write
--    that's a single-table op with no idempotency/atomicity concerns).
-- ============================================================================
--
-- Not covered here:
--   - Submit Order / Request Bill: multi-table writes, executed as
--     SECURITY DEFINER Postgres functions rather than direct guest RLS
--     writes — see docs/architecture.md § Authorization & Idempotency.
--   - Every staff-side policy: lands with the staff auth flow (Email OTP
--     invite, station accounts), which `staff.user_id` (added above in
--     this file) is the link for.
--
-- Mechanics (see apps/web/lib/guest-token.ts for the token-minting side):
--   - Guest JWTs carry the standard `role: authenticated` claim (required
--     for PostgREST's `SET LOCAL ROLE`, so they need the same baseline
--     GRANTs as any authenticated session) plus our own `app_role: guest`
--     claim, which `jwt_is_guest_for_restaurant`/`jwt_is_guest_for_session`
--     below check to scope every policy to guests only and never
--     accidentally match a future staff session.
--   - `restaurant_id` / `session_id` claims scope every policy to
--     exactly the one active session the guest scanned into.
--   - Revocation is live-state, not expiry (architecture.md § Guest
--     Sessions): a token stays cryptographically valid for its full TTL,
--     so every policy re-checks `sessions.status = 'active'` on each
--     query rather than trusting the token was valid when minted — that's
--     what makes closing a session deny access immediately. Every policy
--     below uses the same three helper functions for this reason — none
--     inlines its own claim-extraction or liveness logic.
--
-- Hardening applied to every helper function (Supabase's own linter flags
-- the absence of these): `set search_path = ''` so a search_path hijack
-- can't redirect an unqualified reference to a hostile object, with every
-- table reference inside fully schema-qualified as a result; and
-- `execute` revoked from `public` and re-granted only to `authenticated`
-- — otherwise any Postgres role (including `anon`) can call these and
-- probe, e.g., whether an arbitrary session id is active for an arbitrary
-- restaurant.

create or replace function public.jwt_is_guest_for_restaurant(
	p_restaurant_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
	select (auth.jwt() ->> 'app_role') = 'guest'
		and p_restaurant_id = ((auth.jwt() ->> 'restaurant_id')::uuid);
$$;

revoke execute on function public.jwt_is_guest_for_restaurant(uuid) from public;
grant execute on function public.jwt_is_guest_for_restaurant(uuid) to authenticated;

create or replace function public.jwt_is_guest_for_session(
	p_restaurant_id uuid,
	p_session_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
	select public.jwt_is_guest_for_restaurant(p_restaurant_id)
		and p_session_id = ((auth.jwt() ->> 'session_id')::uuid);
$$;

revoke execute on function public.jwt_is_guest_for_session(uuid, uuid) from public;
grant execute on function public.jwt_is_guest_for_session(uuid, uuid) to authenticated;

create or replace function public.is_active_guest_session(
	p_session_id uuid,
	p_restaurant_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
	select exists (
		select 1
		from public.sessions ts
		where ts.id = p_session_id
			and ts.restaurant_id = p_restaurant_id
			and ts.status = 'active'
	);
$$;

revoke execute on function public.is_active_guest_session(uuid, uuid) from public;
grant execute on function public.is_active_guest_session(uuid, uuid) to authenticated;

-- restaurants: bill header fields (address/gst/state/pincode).
grant select on public.restaurants to authenticated;

create policy "guest_select_own_restaurant" on public.restaurants
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_restaurant(id)
		and public.is_active_guest_session(
			(auth.jwt() ->> 'session_id')::uuid, id
		)
	);

-- menu_categories / menu_items: View Menu. Filtered on `status = active`
-- (soft-delete), never on `availability` — sold-out items must still show,
-- just marked unavailable (docs/product.md § Menu).
grant select on public.menu_categories to authenticated;

create policy "guest_select_active_menu_categories" on public.menu_categories
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_restaurant(restaurant_id)
		and status = 'active'
		and public.is_active_guest_session(
			(auth.jwt() ->> 'session_id')::uuid, restaurant_id
		)
	);

grant select on public.menu_items to authenticated;

create policy "guest_select_active_menu_items" on public.menu_items
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_restaurant(restaurant_id)
		and status = 'active'
		and public.is_active_guest_session(
			(auth.jwt() ->> 'session_id')::uuid, restaurant_id
		)
	);

-- sessions: the guest's own session only, while active.
grant select on public.sessions to authenticated;

create policy "guest_select_own_active_session" on public.sessions
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_session(restaurant_id, id)
		and status = 'active'
	);

-- cart_items: Add to Cart. Any participant edits any line in the shared
-- cart (docs/product.md: "any participant edits freely" — not scoped to
-- rows the guest personally added). Insert/update are pinned to
-- `added_by_type = 'guest'` / `added_by_staff_id is null` so a guest can
-- never attribute a cart edit to staff. No separate
-- `exists (select 1 from menu_items ...)` check is needed here:
-- `cart_items.menu_item_id` carries a composite FK to
-- `menu_items (restaurant_id, id)` (packages/db/src/schema/cart-item.ts),
-- so a cart item can never reference another restaurant's menu item at
-- all — the database enforces it, not this policy.
grant select, insert, update, delete on public.cart_items to authenticated;

create policy "guest_select_session_cart_items" on public.cart_items
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_session(restaurant_id, session_id)
		and public.is_active_guest_session(session_id, restaurant_id)
	);

create policy "guest_insert_session_cart_items" on public.cart_items
	for insert
	to authenticated
	with check (
		public.jwt_is_guest_for_session(restaurant_id, session_id)
		and added_by_type = 'guest'
		and added_by_staff_id is null
		and public.is_active_guest_session(session_id, restaurant_id)
	);

-- USING and WITH CHECK both re-verify session liveness — an update that
-- passed USING (row was fetched at read time) must not act on a session
-- that has closed since; without it, closing a session mid-write did not
-- reliably block that write.
create policy "guest_update_session_cart_items" on public.cart_items
	for update
	to authenticated
	using (
		public.jwt_is_guest_for_session(restaurant_id, session_id)
		and public.is_active_guest_session(session_id, restaurant_id)
	)
	with check (
		public.jwt_is_guest_for_session(restaurant_id, session_id)
		and added_by_type = 'guest'
		and added_by_staff_id is null
		and public.is_active_guest_session(session_id, restaurant_id)
	);

create policy "guest_delete_session_cart_items" on public.cart_items
	for delete
	to authenticated
	using (
		public.jwt_is_guest_for_session(restaurant_id, session_id)
		and public.is_active_guest_session(session_id, restaurant_id)
	);

-- orders / order_items: read-only for guests (derived status display).
-- Submit Order — the write side — is intentionally not here; see header.
grant select on public.orders to authenticated;

create policy "guest_select_session_orders" on public.orders
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_session(restaurant_id, session_id)
		and public.is_active_guest_session(session_id, restaurant_id)
	);

grant select on public.order_items to authenticated;

-- order_items has no session_id of its own — scope through its parent
-- order. Rewritten to use the same helper functions as every sibling
-- policy: the original version of this policy inlined its own auth.jwt()
-- extraction and, in doing so, dropped the liveness check — a guest
-- holding a still-valid token could keep reading a closed session's order
-- items, contradicting architecture.md's "closing a session denies access
-- immediately".
create policy "guest_select_session_order_items" on public.order_items
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_restaurant(restaurant_id)
		and exists (
			select 1
			from public.orders o
			where o.id = order_items.order_id
				and public.jwt_is_guest_for_session(o.restaurant_id, o.session_id)
				and public.is_active_guest_session(o.session_id, o.restaurant_id)
		)
	);

-- bills: read-only for guests (Request Bill — the status-transition write
-- — is intentionally not here; see header).
grant select on public.bills to authenticated;

create policy "guest_select_session_bill" on public.bills
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_session(restaurant_id, session_id)
		and public.is_active_guest_session(session_id, restaurant_id)
	);

-- ============================================================================
-- 4. Dineinly Admin RLS: full cross-tenant access
-- ============================================================================
-- Dineinly Admin identity and its app_metadata.app_role claim: see
-- docs/architecture.md § Authentication.
--
-- Matches the RBAC matrix in docs/product.md — Dineinly Admin is permitted
-- every action on every table. Known gap: docs/product.md requires every
-- admin action be audited; audit_logs is deferred (docs/core-data-model.md)
-- until admin tooling ships, so this section adds access but not the audit
-- trail — must land before production use.
--
-- Same hardening as the guest RLS helpers above: `set search_path = ''`,
-- schema-qualified references, `execute` revoked from `public` and
-- granted only to `authenticated`.

create or replace function public.is_dineinly_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
	-- coalesce, not a bare comparison: a real non-admin session's JWT still
	-- has an app_metadata object, just without an app_role key, so the `->>`
	-- lookup is SQL NULL, not `false` — an `if not is_dineinly_admin() then
	-- raise` guard (see admin_create_restaurant, admin_update_restaurant
	-- below) never fires on `not null`, silently
	-- skipping past the check. RLS `using`/`with check` clauses already treat
	-- NULL as "no match", so this was never a security hole, only a dead
	-- fail-fast check with a confusing downstream error instead of a clear
	-- one.
	select coalesce((auth.jwt() -> 'app_metadata' ->> 'app_role') = 'dineinly_admin', false);
$$;

revoke execute on function public.is_dineinly_admin() from public;
grant execute on function public.is_dineinly_admin() to authenticated;

-- Grants are table-level capability; RLS below is the row-level gate.
-- Broadening these grants doesn't broaden guest access — guests still
-- only match the guest-scoped policies above.
grant select, insert, update, delete on public.restaurants to authenticated;
grant select, insert, update, delete on public.staff to authenticated;
grant select, insert, update, delete on public.restaurant_tables to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.menu_categories to authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
grant select, insert, update, delete on public.menu_labels to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.bills to authenticated;

create policy "admin_all_restaurants" on public.restaurants
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_staff" on public.staff
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_restaurant_tables" on public.restaurant_tables
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_sessions" on public.sessions
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_menu_categories" on public.menu_categories
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_menu_items" on public.menu_items
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_menu_labels" on public.menu_labels
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_cart_items" on public.cart_items
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_orders" on public.orders
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_order_items" on public.order_items
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_bills" on public.bills
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

-- ============================================================================
-- 5. Staff RLS: own-restaurant, own-row access
-- ============================================================================
-- Lets a linked Owner/Manager/Kitchen/Floor staff member reach their own
-- restaurant's pages (Home, Menu Desk) — own row / own restaurant only,
-- same read-write reach as Dineinly Admin has on these tables, just scoped
-- to the one restaurant. Feature-level permission gating within a page
-- (e.g. a waiter reaching Venue Settings, or editing vs. only viewing the
-- menu) is a separate, later concern — see Tbd.md "Feature-level staff
-- permissions".
--
-- Same hardening as every other function in this file: `set search_path =
-- ''`, schema-qualified references, `execute` revoked from `public` and
-- granted only to `authenticated`.

create or replace function public.is_active_staff_for_restaurant(
	p_restaurant_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
	select exists (
		select 1
		from public.staff s
		where s.restaurant_id = p_restaurant_id
			and s.user_id = auth.uid()
			and s.status = 'active'
	);
$$;

revoke execute on function public.is_active_staff_for_restaurant(uuid) from public;
grant execute on function public.is_active_staff_for_restaurant(uuid) to authenticated;

-- Caller's own active role at a restaurant, or null if they have no active
-- Staff row there (including Dineinly Admin, who has none by design). Backs
-- the feature-level (not just page-level) RBAC split below — Manage Menu/
-- Manage Tables are Owner/Manager only, unlike the any-active-staff reach
-- is_active_staff_for_restaurant grants. SECURITY DEFINER: called from
-- staff_roster_select, a policy ON staff itself (§ 15) — SECURITY INVOKER
-- would re-trigger that same policy on its own internal read, infinitely.
-- Safe to bypass RLS here regardless of caller: the query only ever matches
-- the caller's own auth.uid(), never an arbitrary row.
create or replace function public.staff_role_for_restaurant(
	p_restaurant_id uuid
)
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
	select s.role
	from public.staff s
	where s.restaurant_id = p_restaurant_id
		and s.user_id = auth.uid()
		and s.status = 'active'
	limit 1;
$$;

revoke execute on function public.staff_role_for_restaurant(uuid) from public;
grant execute on function public.staff_role_for_restaurant(uuid) to authenticated;

create or replace function public.is_staff_manager_for_restaurant(
	p_restaurant_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
	select public.staff_role_for_restaurant(p_restaurant_id) in ('owner', 'manager');
$$;

revoke execute on function public.is_staff_manager_for_restaurant(uuid) from public;
grant execute on function public.is_staff_manager_for_restaurant(uuid) to authenticated;

create policy "staff_select_own_row" on public.staff
	for select
	to authenticated
	using (user_id = auth.uid());

create policy "staff_select_own_restaurant" on public.restaurants
	for select
	to authenticated
	using (public.is_active_staff_for_restaurant(id));

-- Bills tab (docs/product.md § Billing & Settlement): list/settle/waive
-- service charge/close session all read or write these three tables for
-- sessions across the restaurant, not just the caller's own — unlike the
-- guest policies above, which are scoped to one session by JWT claim. No
-- staff policy existed on any of the three before this — sessions,
-- bills, and cart_items previously had no reach for a non-admin session.
create policy "staff_all_sessions" on public.sessions
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

create policy "staff_all_bills" on public.bills
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

-- Write reach for close_session()'s unfired-cart cleanup (§ 14 below) —
-- bills.get never reads cart_items (a bill's line items come from
-- order_items only), this policy exists solely so close_session() can
-- delete a session's leftover unfired cart rows through RLS.
create policy "staff_all_cart_items" on public.cart_items
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

-- Menu Desk: "View Menu" (docs/product.md § RBAC) is any active staff
-- member, but "Manage Menu" is Owner/Manager only — read and write are two
-- policies, not one, so a Waiter/Kitchen caller keeps seeing the catalog
-- (Kitchen Display's listAvailability, order queue item names) without
-- being able to write it. Item availability (Waiter/Kitchen ✅, "Update Item
-- Availability" row) is carved out of the write restriction below via a
-- dedicated function, set_menu_item_availability (§ 7).
create policy "staff_select_menu_categories" on public.menu_categories
	for select
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id));

create policy "staff_write_menu_categories" on public.menu_categories
	for all
	to authenticated
	using (public.is_staff_manager_for_restaurant(restaurant_id))
	with check (public.is_staff_manager_for_restaurant(restaurant_id));

create policy "staff_select_menu_items" on public.menu_items
	for select
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id));

create policy "staff_write_menu_items" on public.menu_items
	for all
	to authenticated
	using (public.is_staff_manager_for_restaurant(restaurant_id))
	with check (public.is_staff_manager_for_restaurant(restaurant_id));

create policy "staff_select_menu_labels" on public.menu_labels
	for select
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id));

create policy "staff_write_menu_labels" on public.menu_labels
	for all
	to authenticated
	using (public.is_staff_manager_for_restaurant(restaurant_id))
	with check (public.is_staff_manager_for_restaurant(restaurant_id));

-- Kitchen Display: any active staff member reads and advances this
-- restaurant's order queue (docs/core-data-model.md "Kitchen advances
-- status only, never cancels" is enforced app-side, in
-- apps/web/server/routers/kitchen.ts — RLS here only scopes rows to the
-- caller's own restaurant, same reach as staff_all_menu_* above).
create policy "staff_all_orders" on public.orders
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

create policy "staff_all_order_items" on public.order_items
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

-- Table labels: read by Kitchen Display (table chips on each batch card),
-- Bills, and Table Matrix — any active staff. "Manage Tables & QR Codes"
-- (docs/product.md § RBAC) is Owner/Manager only, so writes (create, edit,
-- regenerate QR, hide/show) are a separate, narrower policy.
create policy "staff_select_restaurant_tables" on public.restaurant_tables
	for select
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id));

create policy "staff_write_restaurant_tables" on public.restaurant_tables
	for all
	to authenticated
	using (public.is_staff_manager_for_restaurant(restaurant_id))
	with check (public.is_staff_manager_for_restaurant(restaurant_id));

-- ============================================================================
-- 6. Dineinly Admin restaurant management: atomic multi-table writes
-- ============================================================================
-- Both functions run as SECURITY INVOKER (the default) — Dineinly Admin
-- already has full read/write grants and RLS access on restaurants/staff
-- (§ 4 above), so no elevated privilege is needed, unlike the guest
-- SECURITY DEFINER functions referenced in docs/architecture.md §
-- Authorization & Idempotency. A plpgsql function body is one transaction,
-- giving the restaurant + staff insert/update pair atomicity for free — no
-- partial-write cleanup needed in application code.
--
-- Same hardening as every other RLS-adjacent function in this migration:
-- `set search_path = ''` with fully schema-qualified references, `execute`
-- revoked from `public` and granted only to `authenticated`, and an
-- explicit `is_dineinly_admin()` check as the first statement — RLS would
-- also block a non-admin's writes, but failing fast here gives a clear
-- error instead of a silent zero-row update.

create or replace function public.admin_create_restaurant(
	p_name text,
	p_address text,
	p_city text,
	p_gst_number text,
	p_state text,
	p_pincode text,
	p_experience public.restaurant_experience,
	p_owner_name text,
	p_owner_email text,
	p_owner_mobile text
)
returns table (restaurant_id uuid, staff_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_restaurant_id uuid;
	v_staff_id uuid;
begin
	if not public.is_dineinly_admin() then
		raise exception 'Only Dineinly Admin may create restaurants';
	end if;

	insert into public.restaurants (name, address, city, gst_number, state, pincode, experience)
	values (p_name, p_address, p_city, p_gst_number, p_state, p_pincode, p_experience)
	returning id into v_restaurant_id;

	-- The restaurant's first owner: an invitation record, not a live
	-- account. user_id stays null until they complete their first Email
	-- OTP sign-in (staff auth flow — not yet built, see docs/architecture.md
	-- § Authentication, "Invited staff can't sign in yet").
	insert into public.staff (restaurant_id, email, name, mobile, role, status, invited_at, is_primary_owner)
	values (v_restaurant_id, p_owner_email, p_owner_name, p_owner_mobile, 'owner', 'invited', now(), true)
	returning id into v_staff_id;

	if p_experience in ('menu', 'counter') then
		perform public.ensure_qr_token(v_restaurant_id);
	end if;

	return query select v_restaurant_id, v_staff_id;
end;
$$;

revoke execute on function public.admin_create_restaurant(
	text, text, text, text, text, text, public.restaurant_experience, text, text, text
) from public;
grant execute on function public.admin_create_restaurant(
	text, text, text, text, text, text, public.restaurant_experience, text, text, text
) to authenticated;

-- Shared by admin_update_restaurant and owner_update_restaurant below —
-- docs/product.md § Dineinly Experiences: a restaurant only moves within its
-- own track (Menu<->Guest<->One, or Menu<->Counter). Crossing from
-- Full-Service to Quick-Service or back is a different operating model, not
-- a self-serve toggle, so both callers reject it identically.
create or replace function public.assert_restaurant_track_unchanged(
	p_id uuid,
	p_new_experience public.restaurant_experience
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_current_experience public.restaurant_experience;
begin
	select experience into v_current_experience
	from public.restaurants
	where id = p_id;

	if v_current_experience is null then
		raise exception 'Restaurant not found';
	end if;

	-- Menu is track-neutral (docs/product.md "spans either track") — only a
	-- non-Menu -> non-Menu move across the counter/non-counter line is the
	-- blocked "different operating model" crossing.
	if v_current_experience <> 'menu' and p_new_experience <> 'menu'
		and (v_current_experience = 'counter') <> (p_new_experience = 'counter')
	then
		raise exception 'Cannot change payment timing (Full-Service/Quick-Service) — only the Dineinly Experience within the current track';
	end if;
end;
$$;

revoke execute on function public.assert_restaurant_track_unchanged(
	uuid, public.restaurant_experience
) from public;
grant execute on function public.assert_restaurant_track_unchanged(
	uuid, public.restaurant_experience
) to authenticated;

-- Shared by admin_create_restaurant and both update RPCs below, called
-- whenever p_experience is 'menu' or 'counter' — neither has a Table Matrix
-- (Menu is view-only, no per-table anything; Counter has no physical tables
-- either), so both share one restaurant-level token instead of a
-- restaurant_tables row: an earlier design reused the table/session
-- machinery for Menu and left the QR permanently stuck "occupied" once a
-- single guest scanned it, since Menu has no Close Session flow to free it
-- again. Idempotent — a restaurant that already has a token (its own, or
-- from a prior stint on Menu or Counter) keeps it, so switching between the
-- two — or away and back — reuses the same printed QR instead of minting a
-- new one.
create or replace function public.ensure_qr_token(p_restaurant_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
	update public.restaurants
	set qr_token = gen_random_uuid()::text
	where id = p_restaurant_id and qr_token is null;
end;
$$;

revoke execute on function public.ensure_qr_token(uuid) from public;
grant execute on function public.ensure_qr_token(uuid) to authenticated;

-- Menu/Counter QR "Regenerate" (QrCodeSection / CounterQrSection). SECURITY
-- DEFINER for the same reason as owner_update_restaurant above it:
-- restaurants only has a write policy for Dineinly Admin
-- (admin_all_restaurants) — a plain Owner has row-level SELECT only
-- (staff_select_own_restaurant), so an invoker-mode UPDATE would silently
-- affect 0 rows for that caller. The explicit role check below is what
-- makes bypassing RLS here safe, same pattern as every staff-roster write
-- RPC.
--
-- Unlike a
-- Table Matrix table's regenerateQr (tables.ts), there is no occupied-row
-- guard: neither Menu nor Counter has a table row to protect, so a new
-- token is always minted on request.
--
-- Only Menu also closes every active session on this restaurant:
-- every guest_select_own_restaurant/menu_categories/menu_items policy
-- re-checks sessions.status = 'active' on each query (this file's § 2
-- "Revocation is live-state, not expiry"), so that's what makes a guest
-- already on the old QR lose access immediately rather than riding out
-- their token's TTL. Safe to close in bulk for Menu: it has no ordering (no
-- cart/orders/bills), so every active session on a menu-experience
-- restaurant is a QR-menu viewer, never mid-order. Counter sessions can
-- carry a real cart, a placed order, or an unpaid bill token the guest is
-- holding at the counter — force-closing those on a QR rotation would
-- strand an in-progress purchase, so a Counter session only ever ends via
-- its own lifecycle (close_session), never as a side effect of regenerating
-- the QR other guests scan next.
create or replace function public.regenerate_qr_token(p_restaurant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token text;
	v_experience public.restaurant_experience;
begin
	if not (
		public.is_dineinly_admin()
		or public.staff_role_for_restaurant(p_restaurant_id) = 'owner'
	) then
		raise exception 'Only the restaurant owner may regenerate this QR code';
	end if;

	update public.restaurants
	set qr_token = gen_random_uuid()::text
	where id = p_restaurant_id and experience in ('menu', 'counter')
	returning qr_token, experience into v_token, v_experience;

	if v_token is null then
		raise exception 'Restaurant not found';
	end if;

	if v_experience = 'menu' then
		update public.sessions
		set status = 'closed', closed_at = now()
		where restaurant_id = p_restaurant_id and status = 'active';
	end if;

	return v_token;
end;
$$;

revoke execute on function public.regenerate_qr_token(uuid) from public;
grant execute on function public.regenerate_qr_token(uuid) to authenticated;

-- admin_update_restaurant: updates the restaurant and its owner-contact row
-- in one transaction. Once the primary owner has signed in, their
-- name/email/mobile are immutable through this function — reassigning who
-- holds the role is the only way to change them; p_owner_* is simply
-- ignored in that case.
create or replace function public.admin_update_restaurant(
	p_id uuid,
	p_name text,
	p_address text,
	p_city text,
	p_gst_number text,
	p_state text,
	p_pincode text,
	p_experience public.restaurant_experience,
	p_owner_name text,
	p_owner_email text,
	p_owner_mobile text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_primary_owner_id uuid;
	v_primary_owner_status public.staff_status;
begin
	if not public.is_dineinly_admin() then
		raise exception 'Only Dineinly Admin may update restaurants';
	end if;

	perform public.assert_restaurant_track_unchanged(p_id, p_experience);

	select id, status
	into v_primary_owner_id, v_primary_owner_status
	from public.staff
	where restaurant_id = p_id and is_primary_owner = true
	limit 1;

	update public.restaurants
	set
		name = p_name,
		address = p_address,
		city = p_city,
		gst_number = p_gst_number,
		state = p_state,
		pincode = p_pincode,
		experience = p_experience
	where id = p_id;

	if v_primary_owner_id is null then
		insert into public.staff (restaurant_id, email, name, mobile, role, status, invited_at, is_primary_owner)
		values (p_id, p_owner_email, p_owner_name, p_owner_mobile, 'owner', 'invited', now(), true);
	elsif v_primary_owner_status <> 'active' then
		-- Still invited: re-editing counts as re-inviting, since there's no
		-- separate "resend" action on the Restaurants Directory — bump
		-- invited_at the same way resend_staff_invite does (§ 15) so saving
		-- this form always restarts the invitee's 24h sign-in window.
		update public.staff
		set name = p_owner_name, email = p_owner_email, mobile = p_owner_mobile, invited_at = now()
		where id = v_primary_owner_id;
	end if;

	if p_experience in ('menu', 'counter') then
		perform public.ensure_qr_token(p_id);
	end if;

	return p_id;
end;
$$;

revoke execute on function public.admin_update_restaurant(
	uuid, text, text, text, text, text, text, public.restaurant_experience, text, text, text
) from public;
grant execute on function public.admin_update_restaurant(
	uuid, text, text, text, text, text, text, public.restaurant_experience, text, text, text
) to authenticated;

-- owner_update_restaurant: docs/product.md § RBAC "Restaurant Settings" is
-- Owner + Dineinly Admin only (not Manager) — narrower than every other
-- restaurant-scoped RPC. Same field set and same track-crossing guard as
-- admin_update_restaurant, but never touches the owner-contact row — that's
-- Staff Roster's job (update_own_staff_profile, reassign_primary_owner).
-- SECURITY DEFINER, unlike admin_update_restaurant: `restaurants` only has a
-- write policy for Dineinly Admin (admin_all_restaurants) — a plain Owner
-- has row-level SELECT only (staff_select_own_restaurant), so an invoker-
-- mode UPDATE would silently affect 0 rows for that caller. Same reasoning
-- as every staff-roster write RPC (invite_staff, update_staff, etc.,
-- supabase/migrations/20260816164344_add_staff_roster_rpcs.sql) — the
-- explicit role check above is what makes bypassing RLS here safe.
-- p_experience is accepted but ignored — Venue Settings never offers a
-- Dineinly Experience change (docs/product.md § Dineinly Experiences: that's
-- Dineinly Admin's Restaurants Directory only, via admin_update_restaurant,
-- not self-serve). Kept as a parameter rather than dropped so this
-- signature/grant doesn't need to change, and to accept whatever stale
-- value a caller's own restaurantFieldsSchema-shaped payload still carries.
create or replace function public.owner_update_restaurant(
	p_id uuid,
	p_name text,
	p_address text,
	p_city text,
	p_gst_number text,
	p_state text,
	p_pincode text,
	p_experience public.restaurant_experience
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not (
		public.is_dineinly_admin()
		or public.staff_role_for_restaurant(p_id) = 'owner'
	) then
		raise exception 'Only the restaurant owner may update these settings';
	end if;

	update public.restaurants
	set
		name = p_name,
		address = p_address,
		city = p_city,
		gst_number = p_gst_number,
		state = p_state,
		pincode = p_pincode
	where id = p_id;

	return p_id;
end;
$$;

revoke execute on function public.owner_update_restaurant(
	uuid, text, text, text, text, text, text, public.restaurant_experience
) from public;
grant execute on function public.owner_update_restaurant(
	uuid, text, text, text, text, text, text, public.restaurant_experience
) to authenticated;

-- ============================================================================
-- 7. Menu Desk: reorder_menu_categories, set_menu_item_availability
-- ============================================================================
-- Drag-and-drop category reordering (Menu Desk) writes every category's
-- `sort` in one statement instead of one UPDATE per row from application
-- code — a partial failure mid-drag would otherwise leave categories with
-- duplicate or gapped sort values. Same hardening as every other function in
-- this file: `set search_path = ''` with fully schema-qualified references,
-- `execute` revoked from `public` and granted only to `authenticated`, and
-- an explicit admin-or-manager check as the first statement — RLS on
-- menu_categories (§ 5 above, staff_write_menu_categories) would also block
-- a stranger's write, but failing fast here gives a clear error instead of a
-- silent no-op.

create or replace function public.reorder_menu_categories(
	p_restaurant_id uuid,
	p_category_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_updated integer;
begin
	if not (
		public.is_dineinly_admin()
		or public.is_staff_manager_for_restaurant(p_restaurant_id)
	) then
		raise exception 'Only Dineinly Admin, Owner, or Manager may reorder menu categories';
	end if;

	if (
		select count(*) from public.menu_categories where restaurant_id = p_restaurant_id
	) <> coalesce(array_length(p_category_ids, 1), 0) then
		raise exception 'Category list does not match this restaurant''s categories';
	end if;

	update public.menu_categories as mc
	set sort = reordered.sort
	from (
		select id, ordinality - 1 as sort
		from unnest(p_category_ids) with ordinality as t(id, ordinality)
	) as reordered
	where mc.id = reordered.id and mc.restaurant_id = p_restaurant_id;

	get diagnostics v_updated = row_count;
	if v_updated <> array_length(p_category_ids, 1) then
		raise exception 'One or more categories do not belong to this restaurant';
	end if;
end;
$$;

revoke execute on function public.reorder_menu_categories(uuid, uuid[]) from public;
grant execute on function public.reorder_menu_categories(uuid, uuid[]) to authenticated;

-- "Update Item Availability (86'd)" (docs/product.md § RBAC) is Waiter,
-- Kitchen, Manager, and Owner — any active staff — unlike every other menu
-- write, which staff_write_menu_items (§ 5) restricts to Owner/Manager. This
-- function is the carve-out: it touches only the availability column, on an
-- active (not hidden) item, mirroring menu.ts's updateItemState `.eq(
-- "status", "active")` guard. Any active staff caller reaches it directly
-- (bypassing staff_write_menu_items), never a broader item edit.
create or replace function public.set_menu_item_availability(
	p_restaurant_id uuid,
	p_item_id uuid,
	p_availability public.availability
)
returns table (id uuid, availability public.availability)
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not (
		public.is_dineinly_admin()
		or public.is_active_staff_for_restaurant(p_restaurant_id)
	) then
		raise exception 'Only Dineinly Admin or this restaurant''s staff may update dish availability';
	end if;

	return query
		update public.menu_items
		set availability = p_availability, updated_at = now()
		where menu_items.id = p_item_id
			and menu_items.restaurant_id = p_restaurant_id
			and menu_items.status = 'active'
		returning menu_items.id, menu_items.availability;
end;
$$;

revoke execute on function public.set_menu_item_availability(uuid, uuid, public.availability) from public;
grant execute on function public.set_menu_item_availability(uuid, uuid, public.availability) to authenticated;

-- ============================================================================
-- 8. Guest onboarding: resolve_qr_token
-- ============================================================================
-- Called from apps/web/app/qr/[qrToken]/route.ts before any guest JWT
-- exists, so the caller is Postgres role `anon` (same "no session yet"
-- situation as resolve_staff_signin above) — reading restaurant_tables by
-- qr_token, and writing sessions/restaurant_tables to join-or-create
-- the active session, both need elevated privilege no unauthenticated role
-- has, hence SECURITY DEFINER.
--
-- `for update` row-locks the matched restaurant_tables row so two guests
-- scanning the same physical QR at the same moment serialize onto the same
-- session instead of racing into two. Doubles as the "free the table" step
-- from docs/core-data-model.md's Close Session lifecycle: a session_id left
-- over from a closed session is treated the same as no session at all and
-- is replaced here, on next scan, rather than being cleared eagerly at close.
--
-- `experience` rides along so the route can pick the guest JWT's TTL
-- (lib/guest-token.ts) — Dineinly Menu has no table to seat and no session a
-- staff member ever closes, so its guest token is capped shorter than
-- full-service's, and re-scanning is how a guest picks back up. `anon` has
-- no select grant on restaurants (§ 2), so this is the only way the
-- pre-token route can read it.
--
-- Same hardening as every other function in this file: `set search_path =
-- ''` with fully schema-qualified references, `execute` revoked from
-- `public`.

create or replace function public.resolve_qr_token(
	p_qr_token text,
	-- The scanning browser's own current guest session, if it has one — its
	-- signature is verified server-side (apps/web/app/qr/[qrToken]/route.ts,
	-- against its existing httpOnly cookie) before this call, so it's a
	-- genuine claim of that session, not caller-asserted. This function only
	-- re-checks it belongs to the restaurant this QR resolves to and is
	-- still active before reusing it — it does not re-verify the caller owns
	-- it, so tenancy here still rests on the id being a private, unguessable
	-- v4 UUID that's never exposed anywhere a guest (or anyone else) can read
	-- it outside their own signed cookie. Counter-only resume path:
	-- re-scanning Counter's shared QR used to always mint a fresh, disjoint
	-- session, silently orphaning any cart/paid-but-unsent items the guest
	-- still had open in their real one. Table QR ignores this entirely —
	-- that branch already joins whichever session the table itself currently
	-- holds, by design (shared cart, every scan same session), so there is
	-- nothing to "resume" there.
	p_existing_session_id uuid default null
)
returns table (
	restaurant_id uuid,
	session_id uuid,
	table_label text,
	experience public.restaurant_experience
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
	v_experience public.restaurant_experience;
	v_existing_restaurant_id uuid;
	v_existing_status public.session_status;
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
			from public.sessions ts
			where ts.id = v_session_id;
		end if;

		if v_session_id is null or v_session_status <> 'active' then
			insert into public.sessions (restaurant_id)
			values (v_restaurant_id)
			returning id into v_session_id;

			update public.restaurant_tables
			set session_id = v_session_id
			where id = v_table_id;
		end if;

		select r.experience into v_experience
		from public.restaurants r
		where r.id = v_restaurant_id;

		return query select v_restaurant_id, v_session_id, v_label, v_experience;
		return;
	end if;

	-- No table QR matched — try the Menu/Counter universal QR
	-- (docs/core-data-model.md § Experience Gating). One universal QR serves
	-- many concurrent guests, so a scan normally starts its own fresh,
	-- tableless session — except Counter's own re-scan resume path just
	-- below, which is the one case this reuses an existing session here.
	-- sessions already has no table_id column, so no schema change is
	-- needed for this second entry path. Which behavior the guest gets
	-- (view-only Menu vs order-taking Counter) comes from the live
	-- `experience` value read here, not from a hardcoded branch — the same
	-- token means whichever the restaurant is currently running as.
	select r.id, r.experience into v_restaurant_id, v_experience
	from public.restaurants r
	where r.qr_token = p_qr_token and r.experience in ('menu', 'counter');

	if v_restaurant_id is null then
		raise exception 'Invalid QR code';
	end if;

	-- Counter re-scan resume: only when the browser's own existing session
	-- both belongs to this same restaurant and is still active — a session
	-- closed since (settled, served, and either idle-swept or explicitly
	-- closed) or one carried over from a different restaurant's QR both
	-- fall through to minting a fresh session below, same as before this
	-- parameter existed. Menu keeps its original always-fresh behavior
	-- (short capped TTL is the point there — docs/guest-token.ts) — this
	-- reuse only ever applies to Counter.
	if v_experience = 'counter' and p_existing_session_id is not null then
		select restaurant_id, status into v_existing_restaurant_id, v_existing_status
		from public.sessions
		where id = p_existing_session_id;

		if v_existing_restaurant_id = v_restaurant_id and v_existing_status = 'active' then
			v_session_id := p_existing_session_id;
		end if;
	end if;

	if v_session_id is null then
		insert into public.sessions (restaurant_id)
		values (v_restaurant_id)
		returning id into v_session_id;
	end if;

	return query select v_restaurant_id, v_session_id, null::text, v_experience;
end;
$$;

revoke execute on function public.resolve_qr_token(text, uuid) from public;
-- Called pre-auth (no guest JWT minted yet), so the request arrives as
-- `anon`; also grant `authenticated` for the same leftover-session-cookie
-- reason as resolve_staff_signin above.
grant execute on function public.resolve_qr_token(text, uuid) to anon, authenticated;

-- ============================================================================
-- 9. Guest ordering: submit_order
-- ============================================================================
-- Confirm Order: atomically turns the guest's shared cart into an Order +
-- Order Items, then clears those cart_items (docs/core-data-model.md § Cart
-- Item / Order lifecycle). SECURITY DEFINER because orders/order_items grant
-- guests select-only (see § 3 above) — the insert side needs elevated
-- privilege no guest role has directly.
--
-- Tenancy and session come only from `auth.jwt()` claims, never from
-- arguments — a guest cannot name another session's cart. Prices/tax rates
-- are read fresh from menu_items/menu_categories here, never trusted from
-- the client.
--
-- Idempotency (docs/architecture.md § Authorization & Idempotency): the
-- caller supplies `p_idempotency_key`; a retry of the same key (duplicate
-- tap, network retry) returns the order already created for it instead of
-- creating a second one. `orders.idempotency_key` is globally unique, so a
-- lookup by key alone is enough — no restaurant/session scoping needed on
-- that lookup.
--
-- Same hardening as every other function in this file: `set search_path =
-- ''` with fully schema-qualified references, `execute` revoked from
-- `public`.

create or replace function public.submit_order(p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_restaurant_id uuid;
	v_session_id uuid;
	v_order_id uuid;
	v_experience public.restaurant_experience;
	v_bill_id uuid;
	v_daily_token integer;
begin
	v_restaurant_id := (auth.jwt() ->> 'restaurant_id')::uuid;
	v_session_id := (auth.jwt() ->> 'session_id')::uuid;

	if not public.jwt_is_guest_for_session(v_restaurant_id, v_session_id) then
		raise exception 'Guest session required';
	end if;

	if not public.is_active_guest_session(v_session_id, v_restaurant_id) then
		raise exception 'Session is not active';
	end if;

	select experience into v_experience
	from public.restaurants
	where id = v_restaurant_id;

	-- One/Guest: a settled bill's amounts are frozen (core-data-model.md); a
	-- new order placed after settle would silently drift the paid total, and
	-- unlike Counter there's no next round to start — staff must Close
	-- Session (which requires every bill settled and nothing in progress)
	-- before the table's next QR scan opens a fresh session for more orders.
	-- Counter has no such block: settling just ends the current round, and
	-- this same guest token keeps ordering into a new one (see the bill
	-- resolution below) — that continuity is the whole point of Counter's
	-- session model (docs/core-data-model.md § Lifecycle invariants). Locked
	-- so a concurrent Mark Bill Settled can't commit between this check and
	-- the bill-resolution step below.
	if v_experience <> 'counter' then
		if exists (
			select 1 from public.bills
			where session_id = v_session_id and status = 'settled'
			for update
		) then
			raise exception 'This bill has already been settled — ask staff for a new session';
		end if;
	end if;

	-- Idempotent retry: a prior call with this key already succeeded.
	select id into v_order_id
	from public.orders
	where idempotency_key = p_idempotency_key;

	if v_order_id is not null then
		return v_order_id;
	end if;

	-- Serialize concurrent Confirm Order taps on the same shared session
	-- (docs/product.md: "any participant edits freely"). Without this lock,
	-- two guests confirming near-simultaneously with different idempotency
	-- keys would each see the same non-empty cart and each copy it into a
	-- full duplicate order before either DELETE below runs.
	perform 1 from public.sessions where id = v_session_id for update;

	if not exists (
		select 1 from public.cart_items
		where restaurant_id = v_restaurant_id and session_id = v_session_id
	) then
		raise exception 'Cart is empty';
	end if;

	-- Block rather than silently drop: an item the guest added has since
	-- gone sold-out or been removed from the menu. The guest edits the cart
	-- and retries — never guess which items to submit anyway.
	if exists (
		select 1
		from public.cart_items ci
		join public.menu_items mi
			on mi.restaurant_id = ci.restaurant_id and mi.id = ci.menu_item_id
		where ci.restaurant_id = v_restaurant_id
			and ci.session_id = v_session_id
			and (mi.availability = 'sold_out' or mi.status <> 'active')
	) then
		raise exception 'One or more items in your cart are no longer available';
	end if;

	-- Which bill (if any) this round attaches to (orders.bill_id,
	-- docs/core-data-model.md § Lifecycle invariants). Counter always
	-- resolves one here, reusing the session's latest bill while it's still
	-- unsettled or drawing a fresh round the moment it settles — that's what
	-- lets the guest keep ordering after paying instead of needing a new QR
	-- scan. `for update` on the reuse lookup means a bill a concurrent Mark
	-- Bill Settled just froze is re-evaluated post-lock and excluded, so a
	-- racing order safely starts a new round instead of attaching to a total
	-- that's already been frozen. One/Guest only ever draw a bill via Request
	-- Bill (request_bill()), so this stays whatever that function has already
	-- created (null before the first request) — every order placed before
	-- then is backfilled onto it there.
	if v_experience = 'counter' then
		select id into v_bill_id
		from public.bills
		where session_id = v_session_id and status <> 'settled'
		order by created_at desc
		limit 1
		for update;

		if v_bill_id is null then
			v_daily_token := public.next_daily_token(
				v_restaurant_id,
				(now() at time zone 'Asia/Kolkata')::date
			);

			insert into public.bills (restaurant_id, session_id, status, daily_token)
			values (v_restaurant_id, v_session_id, 'requested', v_daily_token)
			returning id into v_bill_id;
		else
			update public.bills set status = 'requested' where id = v_bill_id;
		end if;
	else
		select id into v_bill_id
		from public.bills
		where session_id = v_session_id
		limit 1;
	end if;

	insert into public.orders (restaurant_id, session_id, bill_id, placed_by_type, idempotency_key)
	values (v_restaurant_id, v_session_id, v_bill_id, 'guest', p_idempotency_key)
	on conflict (idempotency_key) do nothing
	returning id into v_order_id;

	if v_order_id is null then
		-- Lost the race to a concurrent retry with the same key.
		select id into v_order_id
		from public.orders
		where idempotency_key = p_idempotency_key;
		return v_order_id;
	end if;

	-- order_items.tax_rate is NOT NULL; menu_categories.tax_rate is null on
	-- Menu/Guest (docs/product.md § Dineinly Experiences). Guest still
	-- confirms orders here even though it never generates a Dineinly bill, so
	-- coalesce to 0 — inert, since nothing ever reads a Guest order's tax.
	insert into public.order_items (
		restaurant_id, order_id, item_name, unit_price, tax_rate, diet,
		quantity, spice, salt, ice, menu_item_id, added_by_staff_id
	)
	select
		ci.restaurant_id, v_order_id, mi.name, mi.price, coalesce(mc.tax_rate, 0), mi.diet,
		ci.quantity, ci.spice, ci.salt, ci.ice, mi.id, ci.added_by_staff_id
	from public.cart_items ci
	join public.menu_items mi
		on mi.restaurant_id = ci.restaurant_id and mi.id = ci.menu_item_id
	join public.menu_categories mc
		on mc.restaurant_id = mi.restaurant_id and mc.id = mi.category_id
	where ci.restaurant_id = v_restaurant_id and ci.session_id = v_session_id;

	delete from public.cart_items
	where restaurant_id = v_restaurant_id and session_id = v_session_id;

	return v_order_id;
end;
$$;

revoke execute on function public.submit_order(text) from public;
grant execute on function public.submit_order(text) to authenticated;

-- Staff equivalent of submit_order() above, for Order on behalf of guest
-- (docs/product.md § RBAC "Submit Order": Waiter/Manager/Owner, plus
-- Dineinly Admin — the one staff RPC Admin does reach without a Staff row,
-- since placed_by_type has its own 'dineinly_admin' branch alongside 'staff'
-- on orders_placed_by_staff_id_check/cart_items_added_by_staff_id_check
-- specifically so this path doesn't need one). A staff caller has no guest
-- JWT claims to read tenancy/session from, so both are explicit arguments
-- instead of JWT claims. Mirrors submit_order()'s idempotency, empty-cart,
-- availability, and settled-bill guards exactly; only the actor attribution
-- differs.
create or replace function public.staff_submit_order(
	p_restaurant_id uuid,
	p_session_id uuid,
	p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_staff_id uuid;
	v_placed_by_type public.actor_type;
	v_order_id uuid;
	v_experience public.restaurant_experience;
	v_bill_id uuid;
	v_daily_token integer;
begin
	select experience into v_experience from public.restaurants where id = p_restaurant_id;

	-- Dineinly Menu is view-only, no floor ordering (docs/product.md §
	-- Dineinly Experiences) — the tRPC layer already blocks floor.cart.addItem
	-- for it, so a Menu restaurant's cart can never hold items in practice,
	-- but this SECURITY DEFINER function checks directly rather than relying
	-- on that alone.
	if v_experience = 'menu' then
		raise exception 'This feature isn''t available on the Dineinly Menu package';
	end if;

	if public.is_dineinly_admin() then
		v_placed_by_type := 'dineinly_admin';
	else
		-- Counter has no Waiter station (docs/product.md § Dineinly
		-- Experiences), same role split floor.ts's floorRolesFor enforces at
		-- the tRPC layer — checked again here since this SECURITY DEFINER
		-- function is the one place that actually places the order.
		select id into v_staff_id
		from public.staff
		where restaurant_id = p_restaurant_id
			and user_id = auth.uid()
			and status = 'active'
			and (
				role in ('manager', 'owner')
				or (role = 'waiter' and v_experience is distinct from 'counter')
			);

		if v_staff_id is null then
			raise exception '%', case
				when v_experience = 'counter' then 'Only an active Manager or Owner may place an order'
				else 'Only an active Waiter, Manager, or Owner may place an order'
			end;
		end if;

		v_placed_by_type := 'staff';
	end if;

	if not exists (
		select 1 from public.sessions
		where id = p_session_id and restaurant_id = p_restaurant_id and status = 'active'
	) then
		raise exception 'Session is not active';
	end if;

	-- Same rule as submit_order(): One/Guest freeze a settled bill's amounts,
	-- so a new order after that point would silently drift the paid total.
	-- Counter has no such block — see submit_order()'s bill-resolution
	-- comment below.
	if v_experience <> 'counter' then
		if exists (
			select 1 from public.bills
			where session_id = p_session_id and status = 'settled'
			for update
		) then
			raise exception 'This bill has already been settled — close the session before ordering again';
		end if;
	end if;

	select id into v_order_id
	from public.orders
	where idempotency_key = p_idempotency_key;

	if v_order_id is not null then
		return v_order_id;
	end if;

	perform 1 from public.sessions where id = p_session_id for update;

	if not exists (
		select 1 from public.cart_items
		where restaurant_id = p_restaurant_id and session_id = p_session_id
	) then
		raise exception 'Cart is empty';
	end if;

	if exists (
		select 1
		from public.cart_items ci
		join public.menu_items mi
			on mi.restaurant_id = ci.restaurant_id and mi.id = ci.menu_item_id
		where ci.restaurant_id = p_restaurant_id
			and ci.session_id = p_session_id
			and (mi.availability = 'sold_out' or mi.status <> 'active')
	) then
		raise exception 'One or more items in this cart are no longer available';
	end if;

	-- Same bill-resolution as submit_order() — see its comment for the full
	-- reasoning. Mirrored here rather than shared, since the two functions
	-- already don't share a body (tenancy comes from JWT claims there,
	-- explicit arguments here).
	if v_experience = 'counter' then
		select id into v_bill_id
		from public.bills
		where session_id = p_session_id and status <> 'settled'
		order by created_at desc
		limit 1
		for update;

		if v_bill_id is null then
			v_daily_token := public.next_daily_token(
				p_restaurant_id,
				(now() at time zone 'Asia/Kolkata')::date
			);

			insert into public.bills (restaurant_id, session_id, status, daily_token)
			values (p_restaurant_id, p_session_id, 'requested', v_daily_token)
			returning id into v_bill_id;
		else
			update public.bills set status = 'requested' where id = v_bill_id;
		end if;
	else
		select id into v_bill_id
		from public.bills
		where session_id = p_session_id
		limit 1;
	end if;

	insert into public.orders (restaurant_id, session_id, bill_id, placed_by_type, placed_by_staff_id, idempotency_key)
	values (p_restaurant_id, p_session_id, v_bill_id, v_placed_by_type, v_staff_id, p_idempotency_key)
	on conflict (idempotency_key) do nothing
	returning id into v_order_id;

	if v_order_id is null then
		select id into v_order_id
		from public.orders
		where idempotency_key = p_idempotency_key;
		return v_order_id;
	end if;

	-- order_items.tax_rate is NOT NULL; menu_categories.tax_rate is null on
	-- Menu/Guest (docs/product.md § Dineinly Experiences). Guest still
	-- confirms orders here even though it never generates a Dineinly bill, so
	-- coalesce to 0 — inert, since nothing ever reads a Guest order's tax.
	insert into public.order_items (
		restaurant_id, order_id, item_name, unit_price, tax_rate, diet,
		quantity, spice, salt, ice, menu_item_id, added_by_staff_id
	)
	select
		ci.restaurant_id, v_order_id, mi.name, mi.price, coalesce(mc.tax_rate, 0), mi.diet,
		ci.quantity, ci.spice, ci.salt, ci.ice, mi.id, ci.added_by_staff_id
	from public.cart_items ci
	join public.menu_items mi
		on mi.restaurant_id = ci.restaurant_id and mi.id = ci.menu_item_id
	join public.menu_categories mc
		on mc.restaurant_id = mi.restaurant_id and mc.id = mi.category_id
	where ci.restaurant_id = p_restaurant_id and ci.session_id = p_session_id;

	delete from public.cart_items
	where restaurant_id = p_restaurant_id and session_id = p_session_id;

	return v_order_id;
end;
$$;

revoke execute on function public.staff_submit_order(uuid, uuid, text) from public;
grant execute on function public.staff_submit_order(uuid, uuid, text) to authenticated;

-- ============================================================================
-- 10. Staff auth: sign-in gate + post-verify linking
-- ============================================================================
-- Closes the invite-only sign-in gap flagged in apps/web/lib/auth.ts. Two
-- functions:
--
--   - resolve_staff_signin: called from apps/web/sign-in before
--     signInWithOtp, by an unauthenticated request (Postgres role `anon`
--     — there's no session yet). Decides whether GoTrue should be allowed
--     to create the auth.users row on first OTP verify (an email that
--     matches an invited Staff row with no user_id yet) or must not (any
--     other email) — unconditionally allowing it would turn sign-in into
--     open self-signup, breaking the invite-only model. Reading auth.users
--     needs elevated privilege no Postgres role but the table owner has,
--     hence SECURITY DEFINER. Returns a single boolean rather than a
--     three-way existing/invited/unknown result: distinguishing "existing
--     auth.users row" from "unknown email" in the response would let an
--     unauthenticated caller enumerate which emails have Dineinly accounts.
--     The client always proceeds to call signInWithOtp with this flag —
--     for a genuinely unknown email that call itself fails (GoTrue won't
--     create or sign in a nonexistent user with shouldCreateUser: false),
--     so the invite-only gate is enforced without this function adding an
--     extra oracle beyond what GoTrue's own OTP endpoint already exposes.
--
--   - link_staff_account: called right after verifyOtp() succeeds, by the
--     now-authenticated user, to set staff.user_id/status on their own
--     invited row(s) (one person can be invited at more than one
--     restaurant) and hand back their name for the display_name copy the
--     caller makes via auth.updateUser(). Staff has no self-service RLS
--     policy (see § 5 above), so this too is SECURITY DEFINER — but it
--     only ever matches rows against the caller's own auth.uid()/email,
--     never a caller-supplied id, so it can't link an arbitrary Staff row.
--
-- Same hardening as every other function in this file: `set search_path =
-- ''` with fully schema-qualified references, and `execute` revoked from
-- `public`.

create or replace function public.resolve_staff_signin(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select
		not exists (
			select 1 from auth.users where lower(email) = lower(p_email)
		)
		and exists (
			select 1 from public.staff
			where lower(email) = lower(p_email)
				and status = 'invited'
				-- Invite window: 24h from invited_at (invite_staff,
				-- admin_create_restaurant, admin_update_restaurant, or
				-- resend_staff_invite, § 15). Past that, this resolves the
				-- same as "never invited" — no separate error surfaces, since
				-- distinguishing them here would let an unauthenticated
				-- caller learn this email was invited at all (see the
				-- function comment above on the existing/unknown collapse).
				and invited_at > now() - interval '24 hours'
		);
$$;

revoke execute on function public.resolve_staff_signin(text) from public;
-- Called from /sign-in before signInWithOtp — usually anon (no session yet),
-- but a still-valid leftover session cookie makes the same request arrive
-- as `authenticated` (e.g. a signed-in user reloading /sign-in, or a token
-- that hasn't expired despite the app treating the user as logged out).
-- Grant both; the check itself doesn't depend on the caller's identity.
grant execute on function public.resolve_staff_signin(text) to anon, authenticated;

create or replace function public.link_staff_account()
returns table (restaurant_id uuid, staff_id uuid, name text, role public.staff_role)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_email text := auth.jwt() ->> 'email';
begin
	if v_uid is null or v_email is null then
		raise exception 'link_staff_account requires an authenticated session';
	end if;

	return query
		update public.staff
		set user_id = v_uid, status = 'active'
		where lower(staff.email) = lower(v_email)
			and staff.status = 'invited'
			and staff.user_id is null
		returning staff.restaurant_id, staff.id, staff.name, staff.role;
end;
$$;

revoke execute on function public.link_staff_account() from public;
grant execute on function public.link_staff_account() to authenticated;

-- ============================================================================
-- 11. Guest billing: request_bill
-- ============================================================================
-- next_daily_token: atomic per-restaurant, per-day counter backing
-- bills.daily_token (Counter's guest-facing token, restaurant_daily_tokens
-- table, init migration). INSERT ... ON CONFLICT DO UPDATE takes a row lock
-- on the (restaurant_id, token_date) key, so concurrent guests requesting a
-- bill at the same restaurant on the same day still get distinct,
-- gap-tolerant increasing numbers — no separate advisory lock needed. Day
-- boundary is fixed at Asia/Kolkata; the restaurants table has no timezone
-- column today (Dineinly is single-region), so callers pass a date already
-- computed in that zone.
create or replace function public.next_daily_token(
	p_restaurant_id uuid,
	p_token_date date
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
	v_token integer;
begin
	insert into public.restaurant_daily_tokens (restaurant_id, token_date, last_token)
	values (p_restaurant_id, p_token_date, 1)
	on conflict (restaurant_id, token_date) do update
	set last_token = public.restaurant_daily_tokens.last_token + 1
	returning last_token into v_token;

	return v_token;
end;
$$;

-- Revoked from public and never re-granted to authenticated: this writes
-- without request_bill()'s session/tenancy checks, so it's only reachable
-- as a nested call from a SECURITY DEFINER function, not directly by a guest.
revoke execute on function public.next_daily_token(uuid, date) from public;

-- ============================================================================
-- Request Bill (docs/product.md § Billing & Settlement): finds or creates
-- the session's Bill row and moves it open -> requested. bills grants guests
-- select-only (§ 3 above), so the insert/update needs SECURITY DEFINER, same
-- reasoning as submit_order.
--
-- Tenancy and session come only from `auth.jwt()` claims, never arguments,
-- same as submit_order. Idempotent: a guest revisiting the bill screen
-- (guest.bill.get polls this) just returns the same bill id. Only `settled`
-- freezes the row — the CASE guard below stops touching status once
-- settled, so a late poll can never un-settle a bill the restaurant already
-- closed out. Subtotal/tax/total are never written here — bill.ts (schema)
-- and core-data-model.md both specify those stay derived-on-read until
-- settle, computed by the caller from order_items, not this function.
--
-- bill_number and daily_token are both assigned once, only on the row's
-- first insert: the update branch below runs first and handles every later
-- poll, so both are only drawn on a session's first Request Bill.
-- bill_number's value comes from its own column default
-- (bill_number_seq -> encode_bill_number(), see init migration) —
-- collision-free by construction, so no retry loop is needed there.
-- daily_token can't be a column default (next_daily_token() needs the
-- restaurant and today's date, not just a bare sequence), so it's drawn
-- explicitly here, Counter experience only.
create or replace function public.request_bill()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_restaurant_id uuid;
	v_session_id uuid;
	v_bill_id uuid;
	v_experience public.restaurant_experience;
	v_daily_token integer;
begin
	v_restaurant_id := (auth.jwt() ->> 'restaurant_id')::uuid;
	v_session_id := (auth.jwt() ->> 'session_id')::uuid;

	if not public.jwt_is_guest_for_session(v_restaurant_id, v_session_id) then
		raise exception 'Guest session required';
	end if;

	if not public.is_active_guest_session(v_session_id, v_restaurant_id) then
		raise exception 'Session is not active';
	end if;

	-- Serializes concurrent Request Bill taps/polls on the same session — see
	-- submit_order()'s cart-copy lock for the same reasoning. Without it, two
	-- concurrent calls that both find no reusable bill below could each
	-- insert one, now that bills.session_id is no longer unique (a session
	-- can carry more than one bill over its life — see the sessions table).
	perform 1 from public.sessions where id = v_session_id for update;

	-- Only ever matches the session's current, unsettled round — a prior,
	-- already-settled bill (Counter: an earlier paid round) is frozen and
	-- must never be touched by a later poll.
	update public.bills
	set status = 'requested'
	where session_id = v_session_id and status <> 'settled'
	returning id into v_bill_id;

	if v_bill_id is null then
		select experience into v_experience
		from public.restaurants
		where id = v_restaurant_id;

		-- One/Guest cap at exactly one bill, ever (core-data-model.md § Bill
		-- cardinality). The update above only excludes an already-settled
		-- bill from being re-touched, it doesn't stop a second one being
		-- minted for an experience that must never have two — the session
		-- stays active until staff explicitly Close Session, so a guest
		-- replaying this call after their one bill is already settled must
		-- keep getting that same settled bill back, never a fresh,
		-- permanently-unsettleable second row Close Session would then
		-- block on forever.
		if v_experience <> 'counter' then
			select id into v_bill_id
			from public.bills
			where session_id = v_session_id and status = 'settled'
			limit 1;
		end if;

		if v_bill_id is null then
			if v_experience = 'counter' then
				v_daily_token := public.next_daily_token(
					v_restaurant_id,
					(now() at time zone 'Asia/Kolkata')::date
				);
			end if;

			insert into public.bills
				(restaurant_id, session_id, status, daily_token)
			values
				(v_restaurant_id, v_session_id, 'requested', v_daily_token)
			returning id into v_bill_id;

			-- One/Guest: this is the session's first-ever bill (Counter's is
			-- already drawn, and orders.bill_id already set, by submit_order() —
			-- this branch is dead for Counter in normal use). Every order placed
			-- before this point has bill_id still null; they all belong to this
			-- now-created bill, since One/Guest only ever draw one.
			update public.orders
			set bill_id = v_bill_id
			where session_id = v_session_id and bill_id is null;
		end if;
	end if;

	return v_bill_id;
end;
$$;

revoke execute on function public.request_bill() from public;
grant execute on function public.request_bill() to authenticated;

-- Generate / Request Bill, staff side (docs/product.md § Bills tab) —
-- staff-side equivalent of the guest's own request_bill() above, same
-- resolution logic, for sessions that never self-request. Guests carry
-- restaurant_id/session_id as JWT claims request_bill() reads directly; a
-- staff session has no such claims (staff can act on any session in their
-- restaurant), so this takes them as explicit arguments instead —
-- SECURITY DEFINER for the same reason as staff_submit_order: bills grants
-- staff any-active-staff read reach only for a plain insert/update, this
-- needs the elevated write plus the role/experience checks below.
create or replace function public.staff_request_bill(
	p_restaurant_id uuid,
	p_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_staff_id uuid;
	v_bill_id uuid;
	v_experience public.restaurant_experience;
	v_daily_token integer;
begin
	select experience into v_experience
	from public.restaurants
	where id = p_restaurant_id;

	if v_experience = 'menu' then
		raise exception 'This feature isn''t available on the Dineinly Menu package';
	end if;

	-- Request Bill (docs/product.md § RBAC) is Waiter/Manager/Owner —
	-- Kitchen has no reach here, same split as Mark Bill Settled and
	-- Close Session.
	if not public.is_dineinly_admin() then
		select id into v_staff_id
		from public.staff
		where restaurant_id = p_restaurant_id
			and user_id = auth.uid()
			and status = 'active'
			and role in ('waiter', 'manager', 'owner');

		if v_staff_id is null then
			raise exception 'Only an active Waiter, Manager, or Owner may request a bill';
		end if;
	end if;

	if not exists (
		select 1 from public.sessions
		where id = p_session_id and restaurant_id = p_restaurant_id and status = 'active'
	) then
		raise exception 'Session not found or already closed';
	end if;

	-- Serializes concurrent Request Bill calls on the same session — see
	-- request_bill()'s own lock for the same reasoning.
	perform 1 from public.sessions where id = p_session_id for update;

	update public.bills
	set status = 'requested'
	where session_id = p_session_id and status <> 'settled'
	returning id into v_bill_id;

	if v_bill_id is null then
		-- One/Guest cap at exactly one bill, ever — same guard as
		-- request_bill() above, same reasoning.
		if v_experience <> 'counter' then
			select id into v_bill_id
			from public.bills
			where session_id = p_session_id and status = 'settled'
			limit 1;
		end if;

		if v_bill_id is null then
			if v_experience = 'counter' then
				v_daily_token := public.next_daily_token(
					p_restaurant_id,
					(now() at time zone 'Asia/Kolkata')::date
				);
			end if;

			insert into public.bills
				(restaurant_id, session_id, status, daily_token)
			values
				(p_restaurant_id, p_session_id, 'requested', v_daily_token)
			returning id into v_bill_id;

			update public.orders
			set bill_id = v_bill_id
			where session_id = p_session_id and bill_id is null;
		end if;
	end if;

	return v_bill_id;
end;
$$;

revoke execute on function public.staff_request_bill(uuid, uuid) from public;
grant execute on function public.staff_request_bill(uuid, uuid) to authenticated;

-- Counter only: the guest sends each paid item to the kitchen at their own
-- pace rather than every item firing at once on settle (docs/product.md §
-- Order Lifecycle) — this is the guest-side release, kitchen.ts's queue
-- excludes a 'placed' item until released_at is set here, on top of the
-- existing settled-bill gate. Idempotent (`released_at is null` in the
-- WHERE) — a retry/double-tap on an already-released item is a silent
-- no-op, not an error, same as request_bill()'s repeat-poll behavior.
create or replace function public.release_order_item_to_kitchen(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_restaurant_id uuid;
	v_session_id uuid;
	v_bill_status public.bill_status;
begin
	select oi.restaurant_id, o.session_id
	into v_restaurant_id, v_session_id
	from public.order_items oi
	join public.orders o
		on o.restaurant_id = oi.restaurant_id and o.id = oi.order_id
	where oi.id = p_order_item_id;

	-- Same "not found" message whether the item doesn't exist or belongs to
	-- someone else's session — a guest can't use this to probe another
	-- session's order items (same reasoning as submit_order()'s claims-only
	-- tenancy, no client-supplied restaurant/session id to spoof here either,
	-- only the item id).
	if v_restaurant_id is null
		or not public.jwt_is_guest_for_session(v_restaurant_id, v_session_id)
	then
		raise exception 'Order item not found';
	end if;

	-- This item's own bill, not "the session's bill" — a Counter session can
	-- carry more than one bill over its life (settle, order again), so the
	-- gate has to be the round this specific item was ordered and paid in
	-- (orders.bill_id), never a different round's status.
	select b.status into v_bill_status
	from public.orders o
	join public.bills b on b.id = o.bill_id
	where o.restaurant_id = v_restaurant_id
		and o.id = (select order_id from public.order_items where id = p_order_item_id);

	if v_bill_status is distinct from 'settled' then
		raise exception 'Pay the bill before sending items to the kitchen';
	end if;

	update public.order_items
	set released_at = now(), updated_at = now()
	where id = p_order_item_id and released_at is null;
end;
$$;

revoke execute on function public.release_order_item_to_kitchen(uuid) from public;
grant execute on function public.release_order_item_to_kitchen(uuid) to authenticated;

-- Staff-side safety net for the guest release above (docs/product.md § RBAC:
-- every guest-facing self-service action stays staff-reachable too) — a
-- guest can lose their own access to a paid round (a stray QR re-scan before
-- that resumed sessions, a dead phone, a browser that dropped the cookie)
-- and there is no other path back to release_order_item_to_kitchen(), which
-- only ever checks jwt_is_guest_for_session. Same settled-bill gate, same
-- idempotent no-op on an already-released item; only the caller check
-- differs — Waiter/Manager/Owner or Dineinly Admin, mirroring
-- staff_request_bill()'s role list, since this lives in the Bills tab
-- alongside it.
create or replace function public.staff_release_order_item_to_kitchen(
	p_restaurant_id uuid,
	p_order_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_staff_id uuid;
	v_order_id uuid;
	v_bill_status public.bill_status;
begin
	if not public.is_dineinly_admin() then
		select id into v_staff_id
		from public.staff
		where restaurant_id = p_restaurant_id
			and user_id = auth.uid()
			and status = 'active'
			and role in ('waiter', 'manager', 'owner');

		if v_staff_id is null then
			raise exception 'Only an active Waiter, Manager, or Owner may send an item to the kitchen';
		end if;
	end if;

	select order_id into v_order_id
	from public.order_items
	where id = p_order_item_id and restaurant_id = p_restaurant_id;

	if v_order_id is null then
		raise exception 'Order item not found';
	end if;

	-- This item's own bill, not "the session's bill" — a Counter session can
	-- carry more than one bill over its life (settle, order again), so the
	-- gate has to be the round this specific item was ordered and paid in
	-- (orders.bill_id), never a different round's status.
	select b.status into v_bill_status
	from public.orders o
	join public.bills b on b.id = o.bill_id
	where o.restaurant_id = p_restaurant_id and o.id = v_order_id;

	if v_bill_status is distinct from 'settled' then
		raise exception 'Pay the bill before sending items to the kitchen';
	end if;

	update public.order_items
	set released_at = now(), updated_at = now()
	where id = p_order_item_id and restaurant_id = p_restaurant_id and released_at is null;
end;
$$;

revoke execute on function public.staff_release_order_item_to_kitchen(uuid, uuid) from public;
grant execute on function public.staff_release_order_item_to_kitchen(uuid, uuid) to authenticated;

-- ============================================================================
-- 12. Realtime broadcast: publish side (docs/realtime.md)
-- ============================================================================
-- Broadcast from Database via triggers, per docs/realtime.md — never Postgres
-- Changes. `realtime.messages` RLS (§ 13 below) is the subscribe-side
-- authorization gate; these triggers are the publish side, and both must
-- exist for a channel to work end to end.
--
-- Guest/menu-topic payloads carry only ids and the changed field, never a
-- full row: the client handler invalidates the matching TanStack Query cache
-- and refetches through the existing tRPC procedures, which already
-- re-enforce RLS (docs/realtime.md § Subscribe Side — Client: "Handler
-- patches or invalidates"). This is what keeps every trigger a few lines
-- instead of hand-assembling a second, parallel copy of each row's
-- guest-safe shape — the column exclusions docs/realtime.md calls out
-- (idempotency_key, placed_by_staff_id, added_by_staff_id) hold by
-- construction, since none of those columns are ever read into a payload.
--
-- The staff-only topic (restaurant:{id}) uses realtime.broadcast_changes(),
-- the full-row helper docs/realtime.md permits there since no guest ever
-- subscribes to it. Event names are passed explicitly (never tg_op) because
-- several tables broadcast onto the same restaurant:{id} topic — a shared
-- generic event name (e.g. "UPDATE") would make the client unable to tell
-- which table changed without inspecting the payload body.
--
-- Same hardening as every other function in this file: `security definer`
-- (the calling role — anon/authenticated — has no direct grant on
-- realtime.messages), `set search_path = ''`, schema-qualified references.

create or replace function public.broadcast_event(
	p_topic text,
	p_event text,
	p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform realtime.send(p_payload, p_event, p_topic, true);
end;
$$;

-- Internal only: called from the SECURITY DEFINER trigger functions below,
-- never by a client. `public` schema is PostgREST-exposed (config.toml), so
-- without this revoke any anon/authenticated caller could hit
-- /rpc/broadcast_event directly and spoof a broadcast onto any topic,
-- bypassing every realtime.messages RLS policy in § 13 below (those gate
-- SELECT/subscribe, not this definer-side send). No re-grant needed: a
-- trigger function calling this one runs as its own owner, which retains
-- implicit execute on functions it owns regardless of the PUBLIC revoke.
revoke execute on function public.broadcast_event(text, text, jsonb) from public;

-- cart_items: any write -> session:{id} (guests + staff on that session).
create or replace function public.broadcast_cart_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.cart_items;
begin
	v_row := coalesce(new, old);
	perform public.broadcast_event(
		'session:' || v_row.session_id,
		'cart_item.change',
		jsonb_build_object('id', v_row.id, 'op', lower(tg_op))
	);
	return v_row;
end;
$$;

create trigger broadcast_cart_item_change
after insert or update or delete on public.cart_items
for each row execute function public.broadcast_cart_item_change();

-- orders: new round -> session:{id} (guest: order id only) +
-- restaurant:{id} (staff: full row, Kitchen queue).
create or replace function public.broadcast_order_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.broadcast_event(
		'session:' || new.session_id,
		'order.new',
		jsonb_build_object('orderId', new.id)
	);
	perform realtime.broadcast_changes(
		'restaurant:' || new.restaurant_id,
		'order.new', tg_op, tg_table_name, tg_table_schema, new, old
	);
	return new;
end;
$$;

create trigger broadcast_order_new
after insert on public.orders
for each row execute function public.broadcast_order_new();

-- order_items: status change -> session:{id} (guest: name/status only) +
-- restaurant:{id} (staff: full row, Kitchen queue). order_items has no
-- session_id column of its own (composite FK is restaurant_id+order_id, see
-- order-item.ts), so the session comes from a lookup on orders.
create or replace function public.broadcast_order_item_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_session_id uuid;
begin
	select session_id into v_session_id
	from public.orders
	where restaurant_id = new.restaurant_id and id = new.order_id;

	perform public.broadcast_event(
		'session:' || v_session_id,
		'order_item.status',
		jsonb_build_object(
			'orderId', new.order_id,
			'itemId', new.id,
			'itemName', new.item_name,
			'status', new.status
		)
	);
	perform realtime.broadcast_changes(
		'restaurant:' || new.restaurant_id,
		'order_item.status', tg_op, tg_table_name, tg_table_schema, new, old
	);
	return new;
end;
$$;

-- Also fires on released_at (Counter's guest-side kitchen release,
-- release_order_item_to_kitchen() above): that's not a `status` change, but
-- it does change which queue column the item belongs in on the Kitchen
-- Display (kitchen.ts's listQueue excludes an unreleased item entirely) —
-- without this, a release would need a manual refresh to reach the kitchen.
create trigger broadcast_order_item_status
after update of status, released_at on public.order_items
for each row execute function public.broadcast_order_item_status();

-- bills: status change -> session:{id} (guest + staff on that session,
-- "requested"/"settled" only) + restaurant:{id} (staff, full row) — the
-- second topic is what the Bills tab list (many sessions at once, not just
-- the one a guest is sitting at) subscribes to, same staff-only reach as
-- order_new/order_item_status above.
create or replace function public.broadcast_bill_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.broadcast_event(
		'session:' || new.session_id,
		'bill.status',
		jsonb_build_object('billId', new.id, 'status', new.status)
	);
	perform realtime.broadcast_changes(
		'restaurant:' || new.restaurant_id,
		'bill.status', tg_op, tg_table_name, tg_table_schema, new, old
	);
	return new;
end;
$$;

-- Two triggers, not one "insert or update" trigger with a tg_op check in
-- WHEN: a WHEN condition only ever sees OLD/NEW row values, not the TG_OP
-- special variable, so INSERT and UPDATE need separate WHEN clauses anyway.
--
-- The insert trigger covers the Bills tab's settle/waiveServiceCharge
-- mutations (apps/web/server/routers/bills.ts), which can create a bill row
-- already in its target status (settling a session that never had "Request
-- Bill" pressed, for example) rather than transitioning an existing row —
-- an update-only trigger would miss that for every other staff screen
-- watching restaurant:{id} live.
create trigger broadcast_bill_status_insert
after insert on public.bills
for each row
execute function public.broadcast_bill_status();

-- request_bill() (§ 11 above) re-writes status on every call, even when
-- it's already 'requested' or 'settled' (idempotent no-op writes) — the
-- WHEN guard is required here, not just tidy: without it, a guest's own
-- bill.status broadcast would re-invalidate their bill.get query, which
-- calls request_bill() again, re-firing the same no-op update forever.
create trigger broadcast_bill_status_update
after update of status on public.bills
for each row
when (old.status is distinct from new.status)
execute function public.broadcast_bill_status();

-- sessions: open/close -> restaurant:{id} (Floor view; staff only —
-- no guest topic, a guest never needs to know about session metadata beyond
-- what the cart/order/bill broadcasts above already tell them).
create or replace function public.broadcast_session_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform realtime.broadcast_changes(
		'restaurant:' || new.restaurant_id,
		'session.change', tg_op, tg_table_name, tg_table_schema, new, old
	);
	return new;
end;
$$;

create trigger broadcast_session_change
after insert or update of status on public.sessions
for each row execute function public.broadcast_session_change();

-- menu_items: a new dish, or an availability (86'd) / status (hide/show)
-- change -> menu:{restaurant_id} (guests + staff both read this topic). The
-- insert case and both update columns share one trigger/event since any of
-- them changes what a guest sees on the menu, and the client side just
-- invalidates and refetches either way.
create or replace function public.broadcast_menu_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.broadcast_event(
		'menu:' || new.restaurant_id,
		'menu_item.change',
		jsonb_build_object(
			'itemId', new.id,
			'availability', new.availability,
			'status', new.status
		)
	);
	return new;
end;
$$;

create trigger broadcast_menu_item_change
after insert or update of availability, status on public.menu_items
for each row execute function public.broadcast_menu_item_change();

-- menu_categories: a new category, or a sort (Menu Desk reorder) / status
-- change -> menu:{restaurant_id}, same topic and reasoning as menu_items
-- above — a guest's category list/order/visibility is live too, not just
-- item state.
create or replace function public.broadcast_menu_category_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.broadcast_event(
		'menu:' || new.restaurant_id,
		'menu_category.change',
		jsonb_build_object('categoryId', new.id)
	);
	return new;
end;
$$;

create trigger broadcast_menu_category_change
after insert or update of sort, status on public.menu_categories
for each row execute function public.broadcast_menu_category_change();

-- restaurants.qr_token: QR "Regenerate" -> menu:{id}, for Menu/Counter
-- restaurants. An already-open guest tab on the old QR is still subscribed
-- to this topic even after regenerate_qr_token closes a Menu session —
-- can_access_menu_topic below only checks restaurant_id, never session
-- liveness — so this is what signs it off immediately (client invalidates
-- guest.menu, which then reads null under the now-revoked session and shows
-- "please rescan") instead of it sitting on a stale menu until the guest
-- happens to reload. Harmless no-op for a Counter guest whose session
-- regenerate_qr_token deliberately left open — the invalidated refetch just
-- returns the same still-active data.
create or replace function public.broadcast_qr_regenerated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.broadcast_event(
		'menu:' || new.id,
		'qr.regenerated',
		jsonb_build_object('restaurantId', new.id)
	);
	return new;
end;
$$;

create trigger broadcast_qr_regenerated
after update of qr_token on public.restaurants
for each row
when (old.qr_token is distinct from new.qr_token)
execute function public.broadcast_qr_regenerated();

-- ============================================================================
-- 13. Realtime broadcast: subscribe side — realtime.messages RLS
-- ============================================================================
-- Authorization for every channel.subscribe() call, per docs/realtime.md §
-- Channel Model. Reuses the same claim/staff/admin helpers as the table
-- policies above rather than inlining new logic. `realtime.topic()` returns
-- the topic the connecting client is authorizing against; every topic here
-- is `<kind>:<uuid>`, so `split_part` reads the kind and `try_uuid` parses
-- the id without ever raising out of the policy on a malformed topic
-- (a client can request any topic string it likes — an unparsable id must
-- read as "no match", not as a policy error).

create or replace function public.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
	return p_text::uuid;
exception when invalid_text_representation then
	return null;
end;
$$;

revoke execute on function public.try_uuid(text) from public;
grant execute on function public.try_uuid(text) to authenticated;

-- session:{id} — guests on their own active session, plus any active staff
-- of that session's restaurant. Liveness (`ts.status = 'active'`) is
-- re-checked here the same way every guest table policy above does, so
-- closing a session denies the channel immediately, not just new queries.
create or replace function public.can_access_session_topic(p_session_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
	select exists (
		select 1
		from public.sessions ts
		where ts.id = p_session_id
			and ts.status = 'active'
			and (
				public.jwt_is_guest_for_session(ts.restaurant_id, ts.id)
				or public.is_active_staff_for_restaurant(ts.restaurant_id)
				or public.is_dineinly_admin()
			)
	);
$$;

revoke execute on function public.can_access_session_topic(uuid) from public;
grant execute on function public.can_access_session_topic(uuid) to authenticated;

-- restaurant:{id} — staff of that restaurant (or Dineinly Admin) only; no
-- guest claim ever matches here.
create or replace function public.can_access_restaurant_topic(p_restaurant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
	select public.is_active_staff_for_restaurant(p_restaurant_id)
		or public.is_dineinly_admin();
$$;

revoke execute on function public.can_access_restaurant_topic(uuid) from public;
grant execute on function public.can_access_restaurant_topic(uuid) to authenticated;

-- menu:{restaurant_id} — guests and staff of that restaurant; menu
-- availability is already public to any guest with a valid session there.
create or replace function public.can_access_menu_topic(p_restaurant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
	select public.jwt_is_guest_for_restaurant(p_restaurant_id)
		or public.is_active_staff_for_restaurant(p_restaurant_id)
		or public.is_dineinly_admin();
$$;

revoke execute on function public.can_access_menu_topic(uuid) from public;
grant execute on function public.can_access_menu_topic(uuid) to authenticated;

create policy "session_topic_select" on realtime.messages
	for select
	to authenticated
	using (
		split_part(realtime.topic(), ':', 1) = 'session'
		and public.can_access_session_topic(
			public.try_uuid(split_part(realtime.topic(), ':', 2))
		)
	);

create policy "restaurant_topic_select" on realtime.messages
	for select
	to authenticated
	using (
		split_part(realtime.topic(), ':', 1) = 'restaurant'
		and public.can_access_restaurant_topic(
			public.try_uuid(split_part(realtime.topic(), ':', 2))
		)
	);

create policy "menu_topic_select" on realtime.messages
	for select
	to authenticated
	using (
		split_part(realtime.topic(), ':', 1) = 'menu'
		and public.can_access_menu_topic(
			public.try_uuid(split_part(realtime.topic(), ':', 2))
		)
	);

-- ============================================================================
-- 14. Staff floor operations: close_session, force_terminate_session,
--     merge_table_into_session
-- ============================================================================
-- Close Session (docs/product.md § Shared Session, docs/
-- core-data-model.md lifecycle invariants): frees every table pointing at
-- the session (plural — a merged session can span more than one
-- restaurant_tables row), hard-deletes any unfired cart_items, and marks
-- the session closed. Three tables, one transaction — same reasoning as
-- submit_order() above: a partial write would leave a table stuck
-- "occupied" with nothing left to close, or a session "closed" with a
-- table still pointing at it.
--
-- SECURITY DEFINER: sessions/bills/cart_items all grant any active
-- staff write reach (staff_all_sessions/staff_all_bills/
-- staff_all_cart_items, § 5), but staff_write_restaurant_tables (§ 5) is
-- Owner/Manager only — narrower than the Waiter/Manager/Owner this
-- function's own role check (below) allows. Under SECURITY INVOKER, a
-- Waiter caller would pass that role check and then have this function's
-- own restaurant_tables update silently match zero rows under RLS, closing
-- the session while leaving its table stuck "occupied". Elevating to
-- DEFINER makes the explicit role check below the real gate, same
-- reasoning as merge_table_into_session/force_terminate_session below,
-- which need the same table_tables write reach for the same role.
create or replace function public.close_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_restaurant_id uuid;
	v_updated int;
begin
	select restaurant_id into v_restaurant_id
	from public.sessions
	where id = p_session_id and status = 'active';

	if v_restaurant_id is null then
		raise exception 'Session not found or already closed';
	end if;

	-- Close Session (docs/product.md § RBAC) is Waiter/Manager/Owner —
	-- Kitchen has no reach here, same split as Mark Bill Settled and
	-- Force-Terminate Session. staff_all_sessions/staff_all_bills/
	-- staff_all_cart_items (§ 5) stay any-active-staff for read reach
	-- (Bills tab list/get); this is the write-side role gate.
	if not (
		public.is_dineinly_admin()
		or public.staff_role_for_restaurant(v_restaurant_id) in ('waiter', 'manager', 'owner')
	) then
		raise exception 'Only an active Waiter, Manager, or Owner may close a session';
	end if;

	-- A session can carry more than one bill over its life (Counter: settle,
	-- then order again) — every one of them must be settled, not just the
	-- latest, and there must be at least one (an empty session with no bill
	-- at all has nothing settled to close out).
	if not exists (select 1 from public.bills where session_id = p_session_id)
		or exists (
			select 1 from public.bills
			where session_id = p_session_id and status <> 'settled'
		)
	then
		raise exception 'Bill must be settled before closing the session';
	end if;

	if exists (
		select 1
		from public.order_items oi
		join public.orders o on o.id = oi.order_id
		where o.session_id = p_session_id
			and oi.status in ('placed', 'preparing', 'ready')
	) then
		raise exception 'This session still has orders in progress';
	end if;

	delete from public.cart_items where session_id = p_session_id;

	update public.restaurant_tables
	set session_id = null
	where session_id = p_session_id;

	update public.sessions
	set status = 'closed', closed_at = now()
	where id = p_session_id;

	-- Defensive, not a permission check anymore (SECURITY DEFINER bypasses
	-- RLS): guards only against a race with a concurrent close on the same
	-- session between the initial select and this update.
	get diagnostics v_updated = row_count;
	if v_updated = 0 then
		raise exception 'Session no longer active';
	end if;
end;
$$;

revoke execute on function public.close_session(uuid) from public;
grant execute on function public.close_session(uuid) to authenticated;

-- Force-Terminate Session (docs/product.md § Shared Session, RBAC:
-- Waiter/Manager/Owner) — an abandoned session (walkout), closed as an
-- override of Close Session's normal gates: no bill-settled requirement, no
-- check for order items still in progress. It exists precisely because a
-- walkout will never satisfy those gates.
--
-- Void vs. settle an open bill was TBD in docs/product.md / core-data-model.md
-- until resolved (2026-08-19): void. An open or requested bill has nothing
-- settled to preserve, so it's deleted outright rather than frozen — the
-- session's history then shows no bill at all, same as one that was never
-- requested (docs/product.md § Billing & Settlement "Open" state). An
-- already-`settled` bill is left untouched: it's already frozen and
-- reflects a real, confirmed payment, so force-terminate behaves exactly
-- like a normal close for that bill.
--
-- SECURITY DEFINER for the same restaurant_tables reach reason as
-- close_session above.
create or replace function public.force_terminate_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_restaurant_id uuid;
	v_updated int;
begin
	select restaurant_id into v_restaurant_id
	from public.sessions
	where id = p_session_id and status = 'active';

	if v_restaurant_id is null then
		raise exception 'Session not found or already closed';
	end if;

	if not (
		public.is_dineinly_admin()
		or public.staff_role_for_restaurant(v_restaurant_id) in ('waiter', 'manager', 'owner')
	) then
		raise exception 'Only an active Waiter, Manager, or Owner may force-terminate a session';
	end if;

	-- orders.bill_id's FK is plain "no action" (not SET NULL: Postgres would
	-- null the composite FK's restaurant_id column too, violating its NOT
	-- NULL constraint) — null it out here, on bill_id alone, before deleting
	-- the bill it points to.
	update public.orders
	set bill_id = null
	where session_id = p_session_id
		and bill_id in (
			select id from public.bills
			where session_id = p_session_id and status <> 'settled'
		);

	delete from public.bills
	where session_id = p_session_id and status <> 'settled';

	delete from public.cart_items where session_id = p_session_id;

	update public.restaurant_tables
	set session_id = null
	where session_id = p_session_id;

	update public.sessions
	set status = 'closed', closed_at = now()
	where id = p_session_id;

	get diagnostics v_updated = row_count;
	if v_updated = 0 then
		raise exception 'Session no longer active';
	end if;
end;
$$;

revoke execute on function public.force_terminate_session(uuid) from public;
grant execute on function public.force_terminate_session(uuid) to authenticated;

-- Merge Tables (docs/product.md § Shared Session): folds a free
-- (session-less) table into an already-active session. MVP only supports
-- this direction — merging two already-active sessions together is out of
-- scope, same limitation the product doc states. Waiter/Manager/Owner, same
-- role split as Close Session/Force-Terminate; SECURITY DEFINER for the
-- same restaurant_tables reach reason as both.
create or replace function public.merge_table_into_session(
	p_table_id uuid,
	p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_restaurant_id uuid;
	v_updated int;
begin
	select restaurant_id into v_restaurant_id
	from public.sessions
	where id = p_session_id and status = 'active';

	if v_restaurant_id is null then
		raise exception 'Session not found or already closed';
	end if;

	if not (
		public.is_dineinly_admin()
		or public.staff_role_for_restaurant(v_restaurant_id) in ('waiter', 'manager', 'owner')
	) then
		raise exception 'Only an active Waiter, Manager, or Owner may merge tables';
	end if;

	-- `.status = 'active'` excludes a hidden table from ever being merged
	-- in; `.session_id is null` makes "still free" atomic with the write, so
	-- a concurrent merge/QR-scan racing this one just means zero rows match
	-- instead of double-assigning the table.
	update public.restaurant_tables
	set session_id = p_session_id
	where id = p_table_id
		and restaurant_id = v_restaurant_id
		and status = 'active'
		and session_id is null;

	get diagnostics v_updated = row_count;
	if v_updated = 0 then
		raise exception 'That table is no longer free to merge';
	end if;
end;
$$;

revoke execute on function public.merge_table_into_session(uuid, uuid) from public;
grant execute on function public.merge_table_into_session(uuid, uuid) to authenticated;

-- ============================================================================
-- 15. Counter idle auto-close: close_idle_counter_sessions
-- ============================================================================
-- Counter has no physical table to reclaim and no guest-facing "I'm done"
-- action (docs/core-data-model.md § Lifecycle invariants) — a session just
-- stops being touched once the guest has paid and collected every item.
-- Swept periodically by pg_cron rather than closed inline by any one guest
-- action, since "done" here is the absence of further activity, not a single
-- event to hook. One/Guest are untouched: their sessions still only ever
-- close via the explicit staff action (close_session) — a physical table
-- needs bussing before the next party can be seated, which no idle timer can
-- confirm.
--
-- Eligible, either:
--   - every bill for the session is settled (and at least one exists), every
--     order item is `served` or `cancelled`, and the idle clock — the later
--     of the last bill's settled_at or the last order_item's updated_at —
--     has run past p_idle_minutes; or
--   - the session never drew a bill at all (scanned, never ordered) and has
--     simply sat idle since opened_at past the same threshold — nothing to
--     finish, so there's nothing to wait on but the clock itself.
-- No restaurant_tables cleanup: Counter sessions never have a table pointing
-- at them (docs/core-data-model.md § Experience Gating).
--
-- SECURITY DEFINER, but deliberately never granted to `authenticated` —
-- unlike every guest/staff RPC in this file, this is a maintenance sweep
-- with no caller-supplied tenancy to check, so the only intended caller is
-- the pg_cron job below (which runs as the scheduling role, bypassing the
-- public revoke same as any superuser-owned function).
create or replace function public.close_idle_counter_sessions(
	p_idle_minutes integer default 30
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.sessions s
	set status = 'closed', closed_at = now()
	where s.status = 'active'
		and exists (
			select 1 from public.restaurants r
			where r.id = s.restaurant_id and r.experience = 'counter'
		)
		and (
			(
				exists (select 1 from public.bills b where b.session_id = s.id)
				and not exists (
					select 1 from public.bills b
					where b.session_id = s.id and b.status <> 'settled'
				)
				and not exists (
					select 1
					from public.order_items oi
					join public.orders o on o.id = oi.order_id
					where o.session_id = s.id
						and oi.status not in ('served', 'cancelled')
				)
				and greatest(
					(select max(b.settled_at) from public.bills b where b.session_id = s.id),
					coalesce(
						(
							select max(oi.updated_at)
							from public.order_items oi
							join public.orders o on o.id = oi.order_id
							where o.session_id = s.id
						),
						'-infinity'::timestamptz
					)
				) < now() - make_interval(mins => p_idle_minutes)
			)
			or (
				not exists (select 1 from public.bills b where b.session_id = s.id)
				and s.opened_at < now() - make_interval(mins => p_idle_minutes)
			)
		);
end;
$$;

revoke execute on function public.close_idle_counter_sessions(integer) from public;

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
	'close-idle-counter-sessions',
	'*/5 * * * *',
	$$ select public.close_idle_counter_sessions(30); $$
);
