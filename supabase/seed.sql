-- Local dev fixture data. Runs automatically after migrations on every
-- `supabase db reset` (see supabase/config.toml [db.seed]).
--
-- Fixed UUIDs so ids are stable across resets and can be hardcoded in tests
-- and dev links. Scheme: first hex group encodes the table, last segment is
-- a running counter — e.g. all staff rows are 20000000-...-0000000000NN.
-- Middle groups are pinned to `0000-4000-8000` (valid v4 version/variant
-- nibbles) purely so the ids pass RFC4122 validation (e.g. zod's
-- `z.uuid()`, used on guest JWT claims in apps/web/lib/guest-token.ts) —
-- they're placeholders, not real gen_random_uuid() output.
--
-- Tax rate (5% / 18%) and service_charge_rate (5%) below are placeholder
-- values for dev fixtures only — they do NOT resolve the tax/service/
-- rounding formula marked TBD in docs/core-data-model.md.
--
-- pin_hash is left null on every staff row — the PIN flow that writes it
-- lands separately, and a fake hash here would bake in a hashing scheme
-- this file has no business choosing.
--
-- Runs as the postgres superuser, which bypasses RLS.
--
-- Dineinly Admin identity (local dev only — production provisioning is
-- unresolved, see docs/architecture.md § Authentication). Dineinly Admin
-- is a platform-level Supabase Auth identity, not a Staff row (see
-- core-data-model.md), carrying its privileged claim in
-- raw_app_meta_data.app_role, which Supabase embeds in every JWT it
-- issues for this user. No password — signs in via Email OTP like any
-- Owner/Manager. `aud`/`role`/`email_confirmed_at` are set because GoTrue
-- requires them to resolve the user during OTP verification. The token
-- columns (confirmation/recovery/email_change*) default to NULL, but
-- GoTrue's Go scanner reads them as plain strings, not nullable ones —
-- a NULL there fails every auth lookup with "converting NULL to string
-- is unsupported", so they're set to '' explicitly, matching what
-- GoTrue itself writes on a normal signup.

insert into auth.users (
	id, instance_id, aud, role, email, email_confirmed_at,
	confirmation_token, recovery_token, email_change_token_new, email_change,
	raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
	'b0000000-0000-4000-8000-000000000001',
	'00000000-0000-0000-0000-000000000000',
	'authenticated', 'authenticated',
	'admin@dineinly.com', now(),
	'', '', '', '',
	'{"provider":"email","providers":["email"],"app_role":"dineinly_admin"}'::jsonb,
	'{"display_name":"Dineinly Admin"}'::jsonb, now(), now()
)
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values (
	'b0000000-0000-4000-8000-000000000001',
	'b0000000-0000-4000-8000-000000000001',
	'{"sub":"b0000000-0000-4000-8000-000000000001","email":"admin@dineinly.com","email_verified":true}'::jsonb,
	'email', now(), now()
)
on conflict (provider_id, provider) do nothing;

-- 4 already-linked Staff auth identities (owner/manager/waiter/kitchen —
-- everyone but the 5th, still-invited staff row below), representing the
-- end state apps/web/server/routers/auth.ts's link_staff_account leaves
-- after a real first sign-in: an auth.users row, plus staff.user_id
-- pointing at it. raw_user_meta_data.display_name is set here to match
-- staff.name directly, standing in for the display_name copy
-- link_staff_account's caller normally makes via auth.updateUser() right
-- after linking — seeding bypasses that RPC, so it has to do the copy
-- itself. Same column set and NOT NULL-token workaround as the Dineinly
-- Admin identity above (see that block's comment).
insert into auth.users (
	id, instance_id, aud, role, email, email_confirmed_at,
	confirmation_token, recovery_token, email_change_token_new, email_change,
	raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
	('b0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'owner@dineinly.test', now(), '', '', '', '',
		'{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Asha Rao"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'manager@dineinly.test', now(), '', '', '', '',
		'{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Ravi Shetty"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'waiter@dineinly.test', now(), '', '', '', '',
		'{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Priya Nair"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'kitchen@dineinly.test', now(), '', '', '', '',
		'{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Vikram Das"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values
	('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
		'{"sub":"b0000000-0000-4000-8000-000000000002","email":"owner@dineinly.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
		'{"sub":"b0000000-0000-4000-8000-000000000003","email":"manager@dineinly.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004',
		'{"sub":"b0000000-0000-4000-8000-000000000004","email":"waiter@dineinly.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005',
		'{"sub":"b0000000-0000-4000-8000-000000000005","email":"kitchen@dineinly.test","email_verified":true}'::jsonb, 'email', now(), now())
on conflict (provider_id, provider) do nothing;

-- 1 restaurant -----------------------------------------------------------
insert into restaurants (id, name, address, gst_number, state, pincode, service_charge_rate, status)
values (
	'10000000-0000-4000-8000-000000000001',
	'Dineinly Test Kitchen',
	'12 MG Road, Indiranagar',
	'29ABCDE1234F1Z5',
	'Karnataka',
	'560038',
	0.0500,
	'active'
)
on conflict (id) do nothing;

-- 5 staff — owner, manager, waiter, kitchen (linked + active, user_id
-- pointing at the auth identities above — already completed the invite ->
-- Email OTP -> link_staff_account flow) plus a 5th, Meera Iyer, still
-- 'invited' with no user_id and no auth.users row of her own: the
-- pre-link state, fixture for testing resolve_staff_signin's 'invited'
-- branch (see supabase/migrations/20260803042459_add_staff_auth_flow.sql)
-- and the admin restaurants directory's "invited" status badge.
--
-- is_primary_owner is set only on the owner row, matching what
-- admin_create_restaurant() always sets on its inserted owner (see
-- migrations) — leaving it false here (the column default) means the
-- admin restaurants directory finds no primary owner for this restaurant
-- and treats every edit as "no owner yet", inserting a second staff row
-- instead of updating this one. ------------------------------------------
insert into staff (id, restaurant_id, user_id, name, email, role, status, is_primary_owner) values
	('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'Asha Rao', 'owner@dineinly.test', 'owner', 'active', true),
	('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'Ravi Shetty', 'manager@dineinly.test', 'manager', 'active', false),
	('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'Priya Nair', 'waiter@dineinly.test', 'waiter', 'active', false),
	('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'Vikram Das', 'kitchen@dineinly.test', 'kitchen', 'active', false),
	('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', null, 'Meera Iyer', 'waiter2@dineinly.test', 'waiter', 'invited', false)
on conflict (id) do nothing;

-- 2 menu categories — Food (5% tax), Beverages (18% tax) -----------------
insert into menu_categories (id, restaurant_id, name, sort, tax_rate, status) values
	('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Food', 0, 0.0500, 'active'),
	('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Beverages', 1, 0.1800, 'active')
on conflict (id) do nothing;

-- 8 menu items — mixed diet, one sold_out, one archived, some with -------
-- spice/salt/ice set and some left null
insert into menu_items (
	id, restaurant_id, category_id, name, description, price, prep_time,
	serving_size, diet, availability, labels, spice, salt, ice, status
) values
	('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Paneer Butter Masala', 'Cottage cheese in a creamy tomato gravy.', 320.00, 20, '1 bowl (serves 2)',
		'veg', 'available', array['chef special'], 'regular', null, null, 'active'),
	('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Butter Chicken', 'Slow-cooked chicken in a rich buttery tomato gravy.', 380.00, 25, '1 bowl (serves 2)',
		'non_veg', 'available', array[]::text[], 'mild', null, null, 'active'),
	('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Veg Biryani', 'Layered basmati rice with mixed vegetables and spices.', 260.00, 30, '1 plate',
		'veg', 'sold_out', array[]::text[], 'extra spicy', null, null, 'active'),
	('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Chicken 65', 'Deep-fried spiced chicken bites.', 300.00, 15, '1 plate (12 pcs)',
		'non_veg', 'available', array['spicy'], null, null, null, 'active'),
	('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Dal Fry (old recipe)', 'Discontinued — replaced by the new dal tadka.', 180.00, 15, '1 bowl',
		'veg', 'available', array[]::text[], null, null, null, 'archived'),
	('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
		'Masala Chai', 'Spiced Indian tea with milk.', 60.00, 5, '1 cup',
		'veg', 'available', array[]::text[], null, null, null, 'active'),
	('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
		'Lemon Soda', 'Fresh lime soda, sweet or salted.', 90.00, 5, '1 glass',
		'veg', 'available', array[]::text[], null, 'less salt', 'regular', 'active'),
	('40000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
		'Cold Coffee', 'Blended iced coffee with milk.', 140.00, 8, '1 glass',
		'veg', 'available', array['bestseller'], null, null, 'less', 'active')
on conflict (id) do nothing;

-- 2 table sessions — one active, one closed -------------------------------
insert into table_sessions (id, restaurant_id, status, opened_at, closed_at) values
	('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'active', now() - interval '30 minutes', null),
	('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'closed', now() - interval '2 days', now() - interval '2 days' + interval '1 hour')
on conflict (id) do nothing;

-- 4 restaurant tables — T1/T2 seated, T3/T4 free --------------------------
insert into restaurant_tables (id, restaurant_id, label, qr_token, session_id) values
	('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'T1', 'seed-qr-table-1', '50000000-0000-4000-8000-000000000001'),
	('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'T2', 'seed-qr-table-2', '50000000-0000-4000-8000-000000000002'),
	('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'T3', 'seed-qr-table-3', null),
	('60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'T4', 'seed-qr-table-4', null)
on conflict (id) do nothing;

-- 2 cart items in the active session, added by a guest --------------------
insert into cart_items (id, restaurant_id, session_id, menu_item_id, quantity, spice, salt, ice, added_by_type, added_by_staff_id) values
	('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 2, 'regular', null, null, 'guest', null),
	('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000007', 1, null, 'less salt', 'regular', 'guest', null)
on conflict (id) do nothing;

-- 2 orders — one placed by staff (closed session), one by a guest --------
-- (active session). Distinct idempotency_key on each.
insert into orders (id, restaurant_id, session_id, placed_at, placed_by_type, placed_by_staff_id, idempotency_key) values
	('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', now() - interval '2 days' + interval '10 minutes', 'staff', '20000000-0000-4000-8000-000000000003', 'seed-order-1'),
	('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', now() - interval '20 minutes', 'guest', null, 'seed-order-2')
on conflict (id) do nothing;

-- 5 order items — snapshotted name/price/tax/diet, statuses spanning ------
-- placed, preparing, ready, served
insert into order_items (id, restaurant_id, order_id, item_name, unit_price, tax_rate, diet, quantity, status, menu_item_id) values
	('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'Butter Chicken', 380.00, 0.0500, 'non_veg', 1, 'served', '40000000-0000-4000-8000-000000000002'),
	('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'Masala Chai', 60.00, 0.1800, 'veg', 2, 'served', '40000000-0000-4000-8000-000000000006'),
	('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', 'Chicken 65', 300.00, 0.0500, 'non_veg', 1, 'placed', '40000000-0000-4000-8000-000000000004'),
	('90000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', 'Veg Biryani', 260.00, 0.0500, 'veg', 1, 'preparing', '40000000-0000-4000-8000-000000000003'),
	('90000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', 'Cold Coffee', 140.00, 0.1800, 'veg', 1, 'ready', '40000000-0000-4000-8000-000000000008')
on conflict (id) do nothing;

-- 2 bills — open on the active session, settled on the closed one --------
insert into bills (
	id, restaurant_id, session_id, status, service_charge_rate,
	subtotal, tax_amount, service_charge_amount, total, settled_at, settled_by
) values
	('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001',
		'open', null, null, null, null, null, null, null),
	('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002',
		'settled', 0.0500, 500.00, 40.60, 25.00, 565.60,
		now() - interval '2 days' + interval '1 hour', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
