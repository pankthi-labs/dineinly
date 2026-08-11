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
alter table "table_sessions" enable row level security;
alter table "menu_categories" enable row level security;
alter table "menu_items" enable row level security;
alter table "menu_labels" enable row level security;
alter table "cart_items" enable row level security;
alter table "orders" enable row level security;
alter table "order_items" enable row level security;
alter table "bills" enable row level security;

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
--   - `restaurant_id` / `table_session_id` claims scope every policy to
--     exactly the one active table session the guest scanned into.
--   - Revocation is live-state, not expiry (architecture.md § Guest
--     Sessions): a token stays cryptographically valid for its full TTL,
--     so every policy re-checks `table_sessions.status = 'active'` on each
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
		and p_session_id = ((auth.jwt() ->> 'table_session_id')::uuid);
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
		from public.table_sessions ts
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
	using (public.jwt_is_guest_for_restaurant(id));

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
	);

grant select on public.menu_items to authenticated;

create policy "guest_select_active_menu_items" on public.menu_items
	for select
	to authenticated
	using (
		public.jwt_is_guest_for_restaurant(restaurant_id)
		and status = 'active'
	);

-- table_sessions: the guest's own session only, while active.
grant select on public.table_sessions to authenticated;

create policy "guest_select_own_active_session" on public.table_sessions
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
grant select, insert, update, delete on public.table_sessions to authenticated;
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

create policy "admin_all_table_sessions" on public.table_sessions
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

create policy "staff_select_own_row" on public.staff
	for select
	to authenticated
	using (user_id = auth.uid());

create policy "staff_select_own_restaurant" on public.restaurants
	for select
	to authenticated
	using (public.is_active_staff_for_restaurant(id));

-- Menu Desk: any active staff member of the restaurant, not just Owner/
-- Manager — a role-level split (Waiter/Kitchen view-only) is the deferred
-- feature-level gating noted above, not modeled here yet.
create policy "staff_all_menu_categories" on public.menu_categories
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

create policy "staff_all_menu_items" on public.menu_items
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

create policy "staff_all_menu_labels" on public.menu_labels
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

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

-- Table labels: read by Kitchen Display (table chips on each batch card)
-- and, eventually, Table Matrix. No staff policy existed on this table at
-- all before — only admin_all_restaurant_tables — so no non-admin staff
-- session could ever see a table's own label, only Dineinly Admin.
create policy "staff_all_restaurant_tables" on public.restaurant_tables
	for all
	to authenticated
	using (public.is_active_staff_for_restaurant(restaurant_id))
	with check (public.is_active_staff_for_restaurant(restaurant_id));

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
	p_service_charge_rate numeric,
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

	insert into public.restaurants (name, address, city, gst_number, state, pincode, service_charge_rate)
	values (p_name, p_address, p_city, p_gst_number, p_state, p_pincode, p_service_charge_rate)
	returning id into v_restaurant_id;

	-- The restaurant's first owner: an invitation record, not a live
	-- account. user_id stays null until they complete their first Email
	-- OTP sign-in (staff auth flow — not yet built, see docs/architecture.md
	-- § Authentication, "Invited staff can't sign in yet").
	insert into public.staff (restaurant_id, email, name, mobile, role, status, is_primary_owner)
	values (v_restaurant_id, p_owner_email, p_owner_name, p_owner_mobile, 'owner', 'invited', true)
	returning id into v_staff_id;

	return query select v_restaurant_id, v_staff_id;
end;
$$;

revoke execute on function public.admin_create_restaurant(
	text, text, text, text, text, text, numeric, text, text, text
) from public;
grant execute on function public.admin_create_restaurant(
	text, text, text, text, text, text, numeric, text, text, text
) to authenticated;

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
	p_service_charge_rate numeric,
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

	if not exists (select 1 from public.restaurants where id = p_id) then
		raise exception 'Restaurant not found';
	end if;

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
		service_charge_rate = p_service_charge_rate
	where id = p_id;

	if v_primary_owner_id is null then
		insert into public.staff (restaurant_id, email, name, mobile, role, status, is_primary_owner)
		values (p_id, p_owner_email, p_owner_name, p_owner_mobile, 'owner', 'invited', true);
	elsif v_primary_owner_status <> 'active' then
		update public.staff
		set name = p_owner_name, email = p_owner_email, mobile = p_owner_mobile
		where id = v_primary_owner_id;
	end if;

	return p_id;
end;
$$;

revoke execute on function public.admin_update_restaurant(
	uuid, text, text, text, text, text, text, numeric, text, text, text
) from public;
grant execute on function public.admin_update_restaurant(
	uuid, text, text, text, text, text, text, numeric, text, text, text
) to authenticated;

-- ============================================================================
-- 7. Menu Desk: reorder_menu_categories
-- ============================================================================
-- Drag-and-drop category reordering (Menu Desk) writes every category's
-- `sort` in one statement instead of one UPDATE per row from application
-- code — a partial failure mid-drag would otherwise leave categories with
-- duplicate or gapped sort values. Same hardening as every other function in
-- this file: `set search_path = ''` with fully schema-qualified references,
-- `execute` revoked from `public` and granted only to `authenticated`, and
-- an explicit admin-or-own-restaurant-staff check as the first statement —
-- RLS on menu_categories (§ 5 above) would also block a stranger's write,
-- but failing fast here gives a clear error instead of a silent no-op.

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
		or public.is_active_staff_for_restaurant(p_restaurant_id)
	) then
		raise exception 'Only Dineinly Admin or this restaurant''s staff may reorder menu categories';
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

-- ============================================================================
-- 8. Guest onboarding: resolve_qr_token
-- ============================================================================
-- Called from apps/web/app/qr/[qrToken]/route.ts before any guest JWT
-- exists, so the caller is Postgres role `anon` (same "no session yet"
-- situation as resolve_staff_signin above) — reading restaurant_tables by
-- qr_token, and writing table_sessions/restaurant_tables to join-or-create
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
-- Same hardening as every other function in this file: `set search_path =
-- ''` with fully schema-qualified references, `execute` revoked from
-- `public`.

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
	for update;

	if v_table_id is null then
		raise exception 'Invalid QR code';
	end if;

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
end;
$$;

revoke execute on function public.resolve_qr_token(text) from public;
-- Called pre-auth (no guest JWT minted yet), so the request arrives as
-- `anon`; also grant `authenticated` for the same leftover-session-cookie
-- reason as resolve_staff_signin above.
grant execute on function public.resolve_qr_token(text) to anon, authenticated;

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
begin
	v_restaurant_id := (auth.jwt() ->> 'restaurant_id')::uuid;
	v_session_id := (auth.jwt() ->> 'table_session_id')::uuid;

	if not public.jwt_is_guest_for_session(v_restaurant_id, v_session_id) then
		raise exception 'Guest session required';
	end if;

	if not public.is_active_guest_session(v_session_id, v_restaurant_id) then
		raise exception 'Table session is not active';
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
	perform 1 from public.table_sessions where id = v_session_id for update;

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

	insert into public.orders (restaurant_id, session_id, placed_by_type, idempotency_key)
	values (v_restaurant_id, v_session_id, 'guest', p_idempotency_key)
	on conflict (idempotency_key) do nothing
	returning id into v_order_id;

	if v_order_id is null then
		-- Lost the race to a concurrent retry with the same key.
		select id into v_order_id
		from public.orders
		where idempotency_key = p_idempotency_key;
		return v_order_id;
	end if;

	insert into public.order_items (
		restaurant_id, order_id, item_name, unit_price, tax_rate, diet,
		quantity, spice, salt, ice, menu_item_id
	)
	select
		ci.restaurant_id, v_order_id, mi.name, mi.price, mc.tax_rate, mi.diet,
		ci.quantity, ci.spice, ci.salt, ci.ice, mi.id
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
--     hence SECURITY DEFINER.
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
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when exists (
			select 1 from auth.users where lower(email) = lower(p_email)
		) then 'existing'
		when exists (
			select 1 from public.staff
			where lower(email) = lower(p_email) and status = 'invited'
		) then 'invited'
		else 'unknown'
	end;
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
