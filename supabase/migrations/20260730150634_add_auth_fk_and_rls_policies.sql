-- Custom SQL migration file, put your code below! --

-- ============================================================================
-- 1. FK to Supabase's own auth.users
-- ============================================================================
-- Hand-written, not Drizzle-generated. See AGENTS.md / docs/architecture.md
-- § Data: external Supabase schemas (auth, storage, realtime, ...) are
-- never modeled as Drizzle-managed tables. A typed `.references()` stub
-- for auth.users makes drizzle-kit's `generate` (which diffs the TS
-- schema graph, not the live DB) treat that table as ours to manage — it
-- emitted `CREATE SCHEMA auth; CREATE TABLE auth.users`, colliding with
-- the real, already-existing one; on a later regenerate with the stub
-- removed, it emitted `DROP TABLE auth.users CASCADE` instead. Neither
-- must ever run. See packages/db/src/schema/staff.ts for the column.
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
-- Deliberately NOT covered here — flagged separately, not guessed:
--   - Submit Order / Request Bill: routed through a trusted tRPC
--     transaction (DATABASE_URL client), not direct guest RLS writes — see
--     docs/architecture.md § Authorization & Idempotency.
--   - Every staff-side policy: staff auth (Email OTP invite flow, station
--     accounts) has no code yet; `staff.user_id` (added above in this
--     file) is the decided link, but policies come with that flow.
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
--     what makes closing a session deny access immediately.

-- Shared guest-claim checks, factored out since every policy below needs
-- some subset of them.
create or replace function public.jwt_is_guest_for_restaurant(
	p_restaurant_id uuid
)
returns boolean
language sql
stable
as $$
	select (auth.jwt() ->> 'app_role') = 'guest'
		and p_restaurant_id = ((auth.jwt() ->> 'restaurant_id')::uuid);
$$;

create or replace function public.jwt_is_guest_for_session(
	p_restaurant_id uuid,
	p_session_id uuid
)
returns boolean
language sql
stable
as $$
	select public.jwt_is_guest_for_restaurant(p_restaurant_id)
		and p_session_id = ((auth.jwt() ->> 'table_session_id')::uuid);
$$;

create or replace function public.is_active_guest_session(
	p_session_id uuid,
	p_restaurant_id uuid
)
returns boolean
language sql
stable
as $$
	select exists (
		select 1
		from table_sessions ts
		where ts.id = p_session_id
			and ts.restaurant_id = p_restaurant_id
			and ts.status = 'active'
	);
$$;

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
-- never attribute a cart edit to staff, and to `menu_item_id` belonging to
-- the same restaurant — `cart_items.menu_item_id` only FKs to
-- `menu_items.id` (no compound restaurant FK), so without this check a
-- guest could reference another restaurant's menu item by id.
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
		and exists (
			select 1
			from menu_items mi
			where mi.id = menu_item_id
				and mi.restaurant_id = cart_items.restaurant_id
		)
	);

create policy "guest_update_session_cart_items" on public.cart_items
	for update
	to authenticated
	using (public.jwt_is_guest_for_session(restaurant_id, session_id))
	with check (
		public.jwt_is_guest_for_session(restaurant_id, session_id)
		and added_by_type = 'guest'
		and added_by_staff_id is null
		and public.is_active_guest_session(session_id, restaurant_id)
		and exists (
			select 1
			from menu_items mi
			where mi.id = menu_item_id
				and mi.restaurant_id = cart_items.restaurant_id
		)
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

create policy "guest_select_session_order_items" on public.order_items
	for select
	to authenticated
	using (
		(auth.jwt() ->> 'app_role') = 'guest'
		and restaurant_id = ((auth.jwt() ->> 'restaurant_id')::uuid)
		and exists (
			select 1
			from orders o
			where o.id = order_items.order_id
				and o.session_id = ((auth.jwt() ->> 'table_session_id')::uuid)
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
