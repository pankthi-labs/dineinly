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
-- Tax rate (5% / 18%) below is a placeholder value for dev fixtures only —
-- it says nothing about what a real restaurant charges.
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
insert into restaurants (id, name, address, city, gst_number, state, pincode, status, experience)
values (
	'10000000-0000-4000-8000-000000000001',
	'Dineinly Test Kitchen',
	'12 MG Road, Indiranagar',
	'Bengaluru',
	'29ABCDE1234F1Z5',
	'Karnataka',
	'560038',
	'active',
	'one'
)
on conflict (id) do nothing;

-- 5 staff — owner, manager, waiter, kitchen (linked + active, user_id
-- pointing at the auth identities above — already completed the invite ->
-- Email OTP -> link_staff_account flow) plus a 5th, Meera Iyer, still
-- 'invited' with no user_id and no auth.users row of her own: the
-- pre-link state, fixture for testing resolve_staff_signin's
-- shouldCreateUser: true case (see supabase/migrations/
-- 20260730150634_add_auth_fk_and_rls_policies.sql § 10) and the admin
-- restaurants directory's "invited" status badge.
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

-- Restaurant-scoped label vocabulary — the bounded set menu items below pick
-- labels from, and what the Menu Desk "Add label" flow manages.
insert into menu_labels (id, restaurant_id, name) values
	('35000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'chef special'),
	('35000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'spicy'),
	('35000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'bestseller')
on conflict (id) do nothing;

-- 8 menu items — mixed diet, one sold_out, one archived, some offering ----
-- spice/salt/ice and some not
insert into menu_items (
	id, restaurant_id, category_id, name, description, price, prep_time,
	serving_size, diet, availability, labels, offers_spice, offers_salt,
	offers_ice, status
) values
	('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Paneer Butter Masala', 'Cottage cheese in a creamy tomato gravy.', 320.00, '15-20 mins', 'serves 2',
		'veg', 'available', array['chef special'], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Butter Chicken', 'Slow-cooked chicken in a rich buttery tomato gravy.', 380.00, '20-30 mins', 'serves 2',
		'non_veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Veg Biryani', 'Layered basmati rice with mixed vegetables and spices.', 260.00, '20-30 mins', 'serves 1',
		'veg', 'sold_out', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Chicken 65', 'Deep-fried spiced chicken bites.', 300.00, '10-15 mins', 'serves 2',
		'non_veg', 'available', array['spicy'], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
		'Dal Fry (old recipe)', 'Discontinued — replaced by the new dal tadka.', 180.00, '10-15 mins', 'serves 1',
		'veg', 'available', array[]::text[], false, false, false, 'archived'),
	('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
		'Masala Chai', 'Spiced Indian tea with milk.', 60.00, '5-10 mins', 'serves 1',
		'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
		'Lemon Soda', 'Fresh lime soda, sweet or salted.', 90.00, '5-10 mins', 'serves 1',
		'veg', 'available', array[]::text[], false, true, true, 'active'),
	('40000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
		'Cold Coffee', 'Blended iced coffee with milk.', 140.00, '5-10 mins', 'serves 1',
		'veg', 'available', array['bestseller'], false, false, true, 'active')
on conflict (id) do nothing;

-- 2 table sessions — one active, one closed -------------------------------
insert into sessions (id, restaurant_id, status, opened_at, closed_at) values
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

-- 1 bill — settled on the closed session. The active session stays 'open'
-- with no bills row at all: the app never inserts one until Request Bill
-- (bills.ts `request` only ever inserts a row already 'requested'), so a
-- seeded 'open' row here would hand out a bill_number the real "Open, no
-- bill number yet" state never has (bill_number draws unconditionally from
-- bill_number_seq on any insert).
insert into bills (
	id, restaurant_id, session_id, status,
	subtotal, tax_amount, total, settled_at, settled_by
) values
	('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002',
		'settled', 500.00, 40.60, 540.60,
		now() - interval '2 days' + interval '1 hour', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

-- ==========================================================================
-- Arbor Brewing Company — second tenant, rush-hour fixture (Aug 2026).
-- Generated by supabase/gen-arbor-seed.py from supabase/menu-1.md/menu-2.md/menu-3.md
-- — do not hand-edit the generated blocks below, rerun the script instead.
-- See docs/arbor-seed-notes.md for the full scenario writeup (what's seeded
-- and why), so a failing test/feature can be checked against the right fixture.
--
-- ID scheme matches the existing fixture above: same table-prefix scheme,
-- counters continue from wherever the Dineinly Test Kitchen fixture left off
-- (e.g. restaurants counter 2, staff counters 6+, menu_items 9+). Same
-- '0000-4000-8000' placeholder v4 nibbles, not real gen_random_uuid() output.
-- ==========================================================================

-- 1 restaurant — Arbor Brewing Company (Bengaluru brewpub, 30-table floor) ---
insert into restaurants (id, name, address, city, gst_number, state, pincode, status, experience)
values (
	'10000000-0000-4000-8000-000000000002',
	'Arbor Brewing Company',
	'96, 12th Main Road, Indiranagar',
	'Bengaluru',
	'29ARBOR5678B1Z2',
	'Karnataka',
	'560038',
	'active',
	'one'
)
on conflict (id) do nothing;

-- Staff auth identities (Email OTP dev fixtures — same individual-account
-- pattern as the existing seed; docs/architecture.md's shared kitchen/waiter
-- 'station account' design isn't built yet, so this mirrors what actually
-- ships today, not the future pairing-code flow).
insert into auth.users (
	id, instance_id, aud, role, email, email_confirmed_at,
	confirmation_token, recovery_token, email_change_token_new, email_change,
	raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
	('b0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Suresh Kumar"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager1@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Anjali Menon"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager2@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Rohan Mathur"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiter1@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Kavya Reddy"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiter2@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Arjun Bhat"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiter3@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Fatima Sheikh"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiter4@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Nikhil Pillai"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiter5@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Sneha Gowda"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiter6@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Deepak Achar"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kitchen1@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Manoj Verma"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kitchen2@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Farhan Ali"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kitchen3@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Lakshmi Iyengar"}'::jsonb, now(), now()),
	('b0000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'waiter-alumni@arborbrewing.test', now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Vinay Chandran"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values
	('b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000006', '{"sub":"b0000000-0000-4000-8000-000000000006","email":"owner@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000007', '{"sub":"b0000000-0000-4000-8000-000000000007","email":"manager1@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000008', '{"sub":"b0000000-0000-4000-8000-000000000008","email":"manager2@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000009', '{"sub":"b0000000-0000-4000-8000-000000000009","email":"waiter1@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000a', '{"sub":"b0000000-0000-4000-8000-00000000000a","email":"waiter2@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', '{"sub":"b0000000-0000-4000-8000-00000000000b","email":"waiter3@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-00000000000c', '{"sub":"b0000000-0000-4000-8000-00000000000c","email":"waiter4@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-00000000000d', '{"sub":"b0000000-0000-4000-8000-00000000000d","email":"waiter5@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-00000000000e', '{"sub":"b0000000-0000-4000-8000-00000000000e","email":"waiter6@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-00000000000f', 'b0000000-0000-4000-8000-00000000000f', '{"sub":"b0000000-0000-4000-8000-00000000000f","email":"kitchen1@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000010', '{"sub":"b0000000-0000-4000-8000-000000000010","email":"kitchen2@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000011', '{"sub":"b0000000-0000-4000-8000-000000000011","email":"kitchen3@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now()),
	('b0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000012', '{"sub":"b0000000-0000-4000-8000-000000000012","email":"waiter-alumni@arborbrewing.test","email_verified":true}'::jsonb, 'email', now(), now())
on conflict (provider_id, provider) do nothing;

-- 14 staff — owner, 2 managers, 6 waiters, 3 kitchen (all linked+active),
-- 1 invited (never signed in) and 1 removed (had an account, offboarded) —
-- covers the invited/active/removed status trio for RLS + roster filtering.
insert into staff (id, restaurant_id, user_id, name, email, role, status, is_primary_owner) values
	('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000006', 'Suresh Kumar', 'owner@arborbrewing.test', 'owner', 'active', true),
	('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000007', 'Anjali Menon', 'manager1@arborbrewing.test', 'manager', 'active', false),
	('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000008', 'Rohan Mathur', 'manager2@arborbrewing.test', 'manager', 'active', false),
	('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000009', 'Kavya Reddy', 'waiter1@arborbrewing.test', 'waiter', 'active', false),
	('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000a', 'Arjun Bhat', 'waiter2@arborbrewing.test', 'waiter', 'active', false),
	('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000b', 'Fatima Sheikh', 'waiter3@arborbrewing.test', 'waiter', 'active', false),
	('20000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000c', 'Nikhil Pillai', 'waiter4@arborbrewing.test', 'waiter', 'active', false),
	('20000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000d', 'Sneha Gowda', 'waiter5@arborbrewing.test', 'waiter', 'active', false),
	('20000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000e', 'Deepak Achar', 'waiter6@arborbrewing.test', 'waiter', 'active', false),
	('20000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000f', 'Manoj Verma', 'kitchen1@arborbrewing.test', 'kitchen', 'active', false),
	('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000010', 'Farhan Ali', 'kitchen2@arborbrewing.test', 'kitchen', 'active', false),
	('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000011', 'Lakshmi Iyengar', 'kitchen3@arborbrewing.test', 'kitchen', 'active', false),
	('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', null, 'Ritika Shah', 'waiter7@arborbrewing.test', 'waiter', 'invited', false),
	('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000012', 'Vinay Chandran', 'waiter-alumni@arborbrewing.test', 'waiter', 'removed', false)
on conflict (id) do nothing;

-- 19 menu categories, one per menu-*.md section — Food sections at 5% tax,
-- Beverage sections at 18%, matching the existing restaurant's split.
insert into menu_categories (id, restaurant_id, name, sort, tax_rate, status) values
	('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Favourites', 0, 0.0500, 'active'),
	('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Bar Snacks', 1, 0.0500, 'active'),
	('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'Large Plates', 2, 0.0500, 'active'),
	('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'Pizzas', 3, 0.0500, 'active'),
	('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'Desserts', 4, 0.0500, 'active'),
	('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'Salads', 5, 0.0500, 'active'),
	('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', 'Tacos', 6, 0.0500, 'active'),
	('30000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', 'Small Plates', 7, 0.0500, 'active'),
	('30000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002', 'Wings', 8, 0.0500, 'active'),
	('30000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000002', 'Burgers', 9, 0.0500, 'active'),
	('30000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000002', 'Beers on Tap', 10, 0.1800, 'active'),
	('30000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000002', 'Beer Cans', 11, 0.1800, 'active'),
	('30000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000002', 'Classic Cocktails', 12, 0.1800, 'active'),
	('30000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'Sangria & Wine', 13, 0.1800, 'active'),
	('30000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', 'Sparkling Wine & Champagne', 14, 0.1800, 'active'),
	('30000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', 'Mocktails & Kombucha', 15, 0.1800, 'active'),
	('30000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000002', 'Spirits & Liquors', 16, 0.1800, 'active'),
	('30000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000002', 'Whisky & Bourbon', 17, 0.1800, 'active'),
	('30000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000002', 'Non-Alcoholic Beverages', 18, 0.1800, 'active')
on conflict (id) do nothing;

insert into menu_labels (id, restaurant_id, name) values
	('35000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'chef special'),
	('35000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'spicy'),
	('35000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'bestseller'),
	('35000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'new')
on conflict (id) do nothing;

-- 253 menu items transcribed from supabase/menu-1.md/menu-2.md/menu-3.md.
-- Multi-size beers (330ml/500ml/1.5L) and glass/bottle wines become one row
-- per size/pour — menu_items has a single price column, no variant table.
-- Add-on notes (e.g. '+ grilled chicken 100') and wing sauce choices are
-- folded into description text for the same reason — there is no add-on or
-- modifier table in the current schema (see docs/core-data-model.md).
insert into menu_items (
	id, restaurant_id, category_id, name, description, price, prep_time,
	serving_size, diet, availability, labels, offers_spice, offers_salt,
	offers_ice, status
) values
	('40000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Arbor Loaded Nachos', 'Crunchy corn tortilla chips generously covered with melted cheese, refried beans, shredded lettuce, pico de gallo, sour cream, and guacamole (Gluten Free). Add-ons: grilled chicken +100, grilled tenderloin +125.', 420.00, '15-20 mins', 'serves 2', 'veg', 'available', array['bestseller']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Chilli Cheese Bacon Fries', 'Crispy golden French fries smothered in cheese and topped with flavorful beef chilli, crunchy bacon crumbles, and a dollop of cool sour cream. Seasoned with zesty Cajun spices.', 550.00, '15-20 mins', 'serves 2', 'non_veg', 'available', array['bestseller']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Sweet Potato Fries', 'Perfectly seasoned and cooked to crispy perfection. Served alongside Chipotle mayo. (Gluten Free)', 260.00, '10-15 mins', 'serves 1-2', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Flaming Chicken', 'Grilled chicken marinated in a fiery chilli sauce infused with tangy citrus peel, zesty lemon, fresh garlic, bold pepper. Served with magic mustard sauce. (Gluten Free)', 370.00, '15-20 mins', 'serves 1', 'non_veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Hummus Plate', 'Homemade whole wheat pita bread served with creamy hummus, accompanied by a refreshing olive oil, paprika, sundried tomato.', 250.00, '5-10 mins', 'serves 1-2', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Pretzels', 'Mouth-watering soft pretzels, served with a side of Stout mustard sauce and cheese sauce.', 250.00, '10-15 mins', 'serves 1-2', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Beer Battered Onion Rings', 'Crispy and golden, accompanied by a creamy ranch dip and tangy marinara.', 260.00, '10-15 mins', 'serves 1-2', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Pub Style Fish N'' Chips', 'Beer battered fish fried to crispy perfection, served alongside a generous portion of french fries and tartar sauce.', 350.00, '15-20 mins', 'serves 1', 'non_veg', 'available', array['bestseller']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Heavenly Drumsticks', 'Crispy fried chicken drumsticks prepared in oriental-style and coated in a zesty garlic hot sauce.', 325.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array['spicy']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Vegan BBQ Harissa Mushroom Slider', 'Tender oyster mushrooms, zesty harissa paste, and flavorful garlic, all served on a perfectly toasted slider bun.', 325.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array['new']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Spicy Fried Calamari', 'Calamari rings coated in a deliciously zesty Bayou breading and fried to a perfect crisp. Served with our signature marinara sauce and tartar sauce.', 370.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Smoked Chicken Quesadilla', 'Perfect blend of smoky chicken and creamy guacamole, topped off with a sprinkle of tangy Pico de Gallo and melted cheese.', 425.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Pulled Pork Slider', 'Tender slow-cooked pork smothered in our house-made BBQ sauce, nestled between fluffy sesame buns and topped with our signature homemade pickle.', 380.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Sticky Pork Belly', 'Pork belly glazed with lemongrass, soy sauce, ginger, and brown sugar, infused with aromatic cinnamon. (Gluten Free)', 600.00, '20-30 mins', 'serves 1-2', 'non_veg', 'available', array['chef special']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Chimichurri Prawns', 'Prawns dressed in a zesty blend of chimichurri sauce, smoked paprika, garlic, lime juice, and olive oil. (Gluten Free)', 525.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Twice Baked Potato Skins', 'Crispy potato shells stuffed with spinach and artichoke, baked with Jack and Colby cheese. (Gluten Free)', 280.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Jerk Spiced Grilled Cottage Cheese Skewers', 'Jerk-spiced cottage cheese skewers grilled with jerk spice, bell pepper, onion and broccoli. (Gluten Free)', 425.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array['new']::text[], true, false, true, 'active'),
	('40000000-0000-4000-8000-00000000001a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Healthy Bites', 'Fresh cucumber, carrot, and radish slices served with a side of creamy tzatziki sauce. (Gluten Free)', 150.00, '5-10 mins', 'serves 1-2', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000001b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Masala Peanuts', 'A local favourite! Crunchy treats made with a mouth-watering blend of onions, tomatoes, lime, mint, peanuts, and green chillies. (Gluten Free)', 150.00, '5-10 mins', 'serves 1-2', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000001c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'Spiced Marinated Olives', 'Olives marinated with garlic, red wine vinegar, and olive oil. Enhanced with a zesty burst of orange, a spicy kick of chilli flakes, and a sprinkle of fresh parsley. (Gluten Free)', 180.00, '5-10 mins', 'serves 1-2', 'veg', 'available', array[]::text[], true, false, true, 'active'),
	('40000000-0000-4000-8000-00000000001d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Grilled Chicken', 'Jerked spice marinated chicken leg with a side of mash potato, grilled vegetables and served with mushroom red wine jus.', 380.00, '20-30 mins', 'serves 1', 'non_veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000001e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Mediterranean Bowl', 'Falafel, hummus, quinoa tabbouleh, green olives, pickled red onion, and tahini sauce, all served with warm pita bread.', 530.00, '20-30 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000001f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Fiery Chicken Alfredo', 'Creamy alfredo sauce infused with a zesty red chilli paste, perfectly complemented by Cajun-seasoned chicken strips.', 430.00, '20-30 mins', 'serves 1', 'non_veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Spaghetti Arrabiata', 'Spaghetti coated in a zesty and fiery arrabbiata sauce. Add-ons: cajun chicken +100, grilled tenderloin +125, grilled prawns +150.', 280.00, '15-20 mins', 'serves 1', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Baked Mac & Cheese', 'Macaroni coated in a luscious blend of cheddar, parmesan, and mozzarella cheese. Add-ons: crispy bacon +125, cajun chicken +100, grilled tenderloin +125, grilled prawns +150.', 320.00, '20-30 mins', 'serves 1', 'veg', 'available', array['bestseller']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Aglio E Olio', 'Spaghetti noodles tossed with black olives, mushrooms and onions in a light but flavorful garlic, green chilli and olive oil sauce, dusted with parmesan cheese. Add-ons: crispy bacon +125, cajun chicken +100, grilled tenderloin +125, grilled prawns +150.', 320.00, '15-20 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Grilled Red Snapper', 'Tender fillets of red snapper grilled to perfection in a delectable blend of garlic butter, fresh parsley, and zesty paprika spices. (Gluten Free)', 650.00, '20-30 mins', 'serves 1', 'non_veg', 'available', array['chef special']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Steak Tenderloin with Pink Peppercorns', 'Succulent Tenderloin Steak with a savoury red wine pepper sauce, adorned with delectable mushrooms and aromatic pink peppercorns. Served alongside mashed potatoes and grilled vegetables. (Gluten Free)', 680.00, '30-45 mins', 'serves 1', 'non_veg', 'available', array['chef special']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Vegetable Thai Curry', 'Rich and creamy red curry sauce, mixed vegetables, served over steamed rice with crispy wafers on the side. (Gluten Free) Add-ons: chicken +100, prawns +150.', 360.00, '20-30 mins', 'serves 1', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Grilled Salmon', 'Fillet of salmon grilled with lemon, parsley, and capers. Served on a bed of asparagus and accompanied with sweet potatoes. (Gluten Free)', 900.00, '20-30 mins', 'serves 1', 'non_veg', 'sold_out', array['bestseller']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'Margherita', 'Homemade thin-crust pizza, generously coated with our pizza sauce made from our secret recipe, and adorned with a generous layer of shredded mozzarella cheese and fresh basil.', 480.00, '20-30 mins', 'serves 2', 'veg', 'available', array['bestseller']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'Peri-Peri Paneer', 'Spicy paneer pizza with bell peppers, jalapenos, cherry tomatoes, and gooey mozzarella cheese, topped with pesto sauce.', 480.00, '20-30 mins', 'serves 2', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000029', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'Chicken Club Pizza', 'Succulent cuts of white chicken breast paired with creamy mozzarella, Virginia ham, crispy smokehouse bacon, and just a touch of tangy tomato.', 550.00, '20-30 mins', 'serves 2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000002a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'Greek Passion', 'Tangy feta cheese, roasted red peppers, crispy garlic, fresh spinach, and roasted sesame seeds.', 480.00, '20-30 mins', 'serves 2', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000002b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'Garden', 'Flavoursome spiced tomato sauce with a medley of roasted squash, flavorful peppers, tender artichokes, and sun-dried tomatoes.', 500.00, '20-30 mins', 'serves 2', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-00000000002c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'Buffalo Soldier', 'Juicy chicken chunks coated in our signature spicy buffalo sauce, paired with tangy red onions and a savoury blend of grated mozzarella and cheddar.', 550.00, '20-30 mins', 'serves 2', 'non_veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000002d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'I Like To Party', 'Fully-loaded pizza topped with a savoury combination of pepperoni, ham, bacon, sausage, and ooey-gooey cheese.', 550.00, '20-30 mins', 'serves 2', 'non_veg', 'available', array['bestseller']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000002e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000006', 'Pepperoni Pizza', 'Tangy tomato sauce infused with spices, topped with pork pepperoni and generous layers of mozzarella cheese.', 550.00, '20-30 mins', 'serves 2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000002f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'Long Lasting Vertigo', 'Three layers of rich chocolate sponge cake oozing with smooth and creamy chocolate mousse.', 260.00, '10-15 mins', 'serves 1', 'veg', 'available', array['bestseller']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'Tiramisu', 'Rich layer cake soaked in a blend of coffee, rum, and Kahlua, and generously filled with cream cheese.', 260.00, '10-15 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'Banoffee Pie', 'Discontinued — kept for historical order snapshots. Buttery biscuit crust, creamy toffee filling, and slices of fresh banana. (Eggless)', 240.00, '10-15 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'archived'),
	('40000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'Caramel Drizzled Brownie', 'Decadent chocolate brownie, generously drizzled with gooey caramel sauce, served alongside a scoop of creamy vanilla ice cream.', 350.00, '10-15 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000007', 'Lemon Meringue Pie', 'Buttery biscuit base topped with a luscious layer of creamy lemon curd, finished with a fluffy, golden-brown meringue.', 260.00, '10-15 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000008', 'Caesar Salad', 'Fresh, crispy lettuce and croutons, tossed together with a timeless anchovy and Parmesan Caesar dressing. Add-ons: grilled chicken +100, grilled tenderloin +125, grilled prawns +150.', 220.00, '10-15 mins', 'serves 1', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000035', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000008', 'Mediterranean Salad', 'Boutique garden greens paired with feta cheese, black olives, red onion, sun-dried tomatoes, artichokes, and cucumber, tossed in a zesty Italian vinaigrette. (Gluten Free) Add-ons: grilled chicken +100, grilled tenderloin +125, grilled prawns +150.', 320.00, '10-15 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000008', 'Fajita Salad', 'Sizzling capsicum, onion, and mushroom served on a crisp bed of lettuce. Topped with rich guacamole, zesty pico de gallo, and creamy ranch dressing. (Gluten Free) Add-ons: grilled chicken +100, grilled tenderloin +125, grilled prawns +150.', 260.00, '10-15 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000037', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000008', 'Beet Salad w/ Goat Cheese & Balsamic', 'Fresh arugula, tangy goat cheese, crisp green apple slices, and crunchy toasted walnuts. Topped with sliced shallots and drizzled with balsamic vinaigrette, finished with crispy potato crisps. (Gluten Free)', 320.00, '10-15 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000038', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000009', 'Blackened Shrimp Taco', 'Bold flavour of juicy blackened shrimp on a bed of zesty black bean relish, complemented by crumbled feta cheese and creamy avocado crema, nestled in a warm corn tortilla, garnished with fresh cilantro. (Gluten Free)', 500.00, '15-20 mins', 'serves 1', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000039', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000009', 'BBQ Oyster Mushroom Tacos', 'Smoky oyster mushrooms paired with the bold kick of harissa paste, accented with garlic and smoked paprika powder. Served on a soft corn tortilla, topped with fresh microgreens and a drizzle of olive oil. (Gluten Free)', 425.00, '15-20 mins', 'serves 1', 'veg', 'available', array['new']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000003a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000009', 'BBQ Chicken Tacos', 'Smoked chicken smothered in a tangy cherry BBQ sauce, combined with zesty pico de gallo and melty cheddar jack cheese, nestled on a warm corn tortilla and crowned with crispy fried onion straws. (Gluten Free)', 325.00, '15-20 mins', 'serves 1', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000003b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000009', 'Smoked Pork Tacos', 'Tenderised smoked pork on a bed of fresh corn tortilla. Topped with our signature homemade strawberry jam, tangy pickled jalapenos, zesty red onion, and crumbled goat cheese. (Gluten Free)', 525.00, '15-20 mins', 'serves 1', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000003c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000009', 'Roasted Cauliflower Tacos', 'Perfectly roasted cauliflower, tangy pickled radishes, spicy jalapeño crema, and fresh scallions; all served on a warm corn tortilla. (Gluten Free)', 285.00, '15-20 mins', 'serves 1', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000003d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Schnitzel-Style Chicken Strips', 'Tender strips of chicken served with a side of creamy ranch dressing.', 350.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000003e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Tex Mex Fries', 'Zesty cajun spice blend, served with creamy beer cheese, chunky salsa, fresh guacamole, homemade sour cream, topped with sliced scallions and spicy jalapenos.', 375.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array['spicy']::text[], true, false, true, 'active'),
	('40000000-0000-4000-8000-00000000003f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Ginger Beef Stir-Fry', 'Tenderized beef strips paired with Chinese cabbage, bok choy, zesty ginger, fresh green onion, and a sprinkle of fragrant sesame seeds.', 460.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000040', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Grilled Piri Piri Prawns', 'Juicy grilled prawns infused with our piri piri marinade and drizzled with olive oil. (Gluten Free)', 500.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Sausage Platter', 'Delicious selection of sausages including Bratwurst, Garlic Karakauer Smoked, Cheese & Chilli Chicken, and Chicken Nurenberger. (Gluten Free)', 600.00, '15-20 mins', 'serves 2', 'non_veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'BBQ Pork Ribs', 'Succulent pork ribs slow-cooked to perfection with a savoury blend of garlic and rosemary, slathered in our signature BBQ sauce for a sweet and tangy finish. (Gluten Free)', 600.00, '30-45 mins', 'serves 1-2', 'non_veg', 'available', array['chef special']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000043', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Grilled Mongolian Stout Beef Skewers', 'Grilled skewered beef marinated in a savoury blend of ginger, garlic, soy sauce, and sesame oil, with a bold twist of stout beer. (Gluten Free)', 575.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000044', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Turkish Lamb Kebab', 'Minced grilled lamb seasoned with a blend of aromatic herbs and spices. Served with a side of bourbon-infused barbecue sauce. (Gluten Free)', 460.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array['chef special']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000045', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Salt & Pepper Prawn', 'Crispy Oriental-style prawns tossed with salt and pepper, accompanied by a side of refreshing coleslaw.', 400.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000046', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Chilli Fish', 'Crispy, Oriental-style fish coated in a mouthwatering blend of spicy chilli sauce and sautéed onions and dry red chillies.', 350.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000047', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Manchurian Cauliflower & Baby Corn', 'Mouth-watering flavour of our Manchurian Cauliflower and Baby Corn dish, hailed by our founder and resident Manchurian connoisseur as "the best Manchurian sauce in Bangalore!"', 250.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000048', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Citrus Marinated Fish Fingers', 'Herb-crusted fish fingers with citrus marinade, served with tangy tartar sauce.', 375.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000049', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Cajun Style Fried Devilled Eggs', 'Boiled eggs mixed with zesty dill pickle, tangy yellow mustard, and creamy mayonnaise. Coated in crispy panko crumbs and seasoned with bold cajun spice.', 280.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000004a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Chilli Cheese Garlic Toast', 'Crispy garlic baguette slices topped with a spicy blend of cheese and chillies. Served with your choice of dipping sauce — classic marinara or tangy ranch.', 300.00, '10-15 mins', 'serves 1-2', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000004b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Old School Chilli Chicken', 'A classic Bangalore favourite for the ages! Oriental style cubed chicken tossed with onion and bell pepper in spicy chilli sauce.', 380.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array['bestseller']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000004c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Spicy Stir-Fry Pot', 'Tender lotus stem, crunchy water chestnuts, savoury mushrooms, and zesty scallions, cooked to perfection with our homemade stir-fry sauce. (Gluten Free)', 350.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000004d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Pub Fries', 'Crispy fries available in three irresistible flavours: Classic, Garlic Herb, or Cajun.', 260.00, '10-15 mins', 'serves 1-2', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000004e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Spinach & Artichoke Dip', 'A delicious blend of spinach, artichoke, parmesan and cream cheese baked to perfection, served with homemade whole wheat pita bread.', 325.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000004f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Grilled Greek Lamb Souvlaki', 'Juicy lamb skewers paired with a classic Greek salad, freshly baked pita bread, and creamy tzatziki sauce.', 550.00, '20-30 mins', 'serves 1-2', 'non_veg', 'available', array['chef special']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000050', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000a', 'Turkish Pide', 'Freshly baked flatbread topped with a zesty peri peri sauce, mixed peppers, savoury mushrooms, creamy mozzarella cheese, tangy feta cheese, and garnished with fresh coriander.', 250.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000051', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000b', 'Cauliflower Wings', 'Served with your choice of Ranch or Bleu Cheese Dressing. Tossed in your choice of sauce: Hot Buffalo, IPA Sriracha, Naga Jolokia, or Mexican Chipotle.', 250.00, '15-20 mins', 'serves 1-2', 'veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000052', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000b', 'Chicken Wings', 'Served with your choice of Ranch or Bleu Cheese Dressing. Tossed in your choice of sauce: Hot Buffalo, IPA Sriracha, Naga Jolokia, or Mexican Chipotle.', 325.00, '15-20 mins', 'serves 1-2', 'non_veg', 'available', array['bestseller']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000053', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000c', 'The Arbor-ger', 'An American classic with an Indian twist! Seasoned 1/4 lb all-buff patty, topped with fresh lettuce, ripe tomato, creamy mayo, and crispy onion rings. Served with your choice of Plain, Cajun, Garlic, or Sweet Potato Fries. Choice of homemade buns: Sesame or Masala.', 500.00, '20-30 mins', 'serves 1', 'non_veg', 'available', array['bestseller']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000054', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000c', 'Tex Mex Black Bean Burger', 'Our signature homemade black bean patty, perfectly seasoned and topped with fresh pico de gallo and melted cheddar cheese. Served with your choice of Plain, Cajun, Garlic, or Sweet Potato Fries. Choice of homemade buns: Sesame or Masala.', 380.00, '20-30 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000055', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000c', 'Mediterranean Lamb Burger', 'Seasoned ground lamb piled high, topped with creamy melted cheese, crisp lettuce, and a kick of flavorful harissa paste. Served with your choice of Plain, Cajun, Garlic, or Sweet Potato Fries. Choice of homemade buns: Sesame or Masala.', 550.00, '20-30 mins', 'serves 1', 'non_veg', 'available', array['spicy']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000056', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000c', 'Buffalo Chicken Burger', 'Tender Panko-crumbed chicken coated in our homemade buffalo sauce. Topped with savoury blue cheese, crispy celery, spicy jalapeno, tangy pickles, and melted cheddar cheese. Served with your choice of Plain, Cajun, Garlic, or Sweet Potato Fries. Choice of homemade buns: Sesame or Masala.', 480.00, '20-30 mins', 'serves 1', 'non_veg', 'available', array['bestseller']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000057', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Easy Rider (330ml)', 'Brewed for the free spirit in all of us. As fresh as the open road with a smooth mouthfeel, a hint of citrusy fruit, a light breezy hop character. (American Wheat, ABV 4.9%, IBU 10)', 240.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000058', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Easy Rider (500ml)', 'Brewed for the free spirit in all of us. As fresh as the open road with a smooth mouthfeel, a hint of citrusy fruit, a light breezy hop character. (American Wheat, ABV 4.9%, IBU 10)', 320.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000059', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Easy Rider (1.5L pitcher)', 'Brewed for the free spirit in all of us. As fresh as the open road with a smooth mouthfeel, a hint of citrusy fruit, a light breezy hop character. (American Wheat, ABV 4.9%, IBU 10)', 920.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000005a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Phat Abbot (330ml)', 'A happy marriage of spicy, fruity and warming alcohol flavours layered over a soft malt character. Complex fruity esters contribute notes of sweet citrus and spice and tropical fruit. (Belgian Tripel, ABV 8%, IBU 26)', 300.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000005b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Phat Abbot (500ml)', 'A happy marriage of spicy, fruity and warming alcohol flavours layered over a soft malt character. Complex fruity esters contribute notes of sweet citrus and spice and tropical fruit. (Belgian Tripel, ABV 8%, IBU 26)', 400.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000005c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Bangalore Bliss (330ml)', 'Classic aromas of banana, clove and floral lemon citrus blossom. Fruity, spicy aromas show a rich yeasty character on a smooth, medium-bodied palate. (Hefeweizen, ABV 5.5%, IBU 15)', 240.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000005d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Bangalore Bliss (500ml)', 'Classic aromas of banana, clove and floral lemon citrus blossom. Fruity, spicy aromas show a rich yeasty character on a smooth, medium-bodied palate. (Hefeweizen, ABV 5.5%, IBU 15)', 320.00, '5-10 mins', 'serves 1', 'veg', 'available', array['bestseller']::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000005e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Bangalore Bliss (1.5L pitcher)', 'Classic aromas of banana, clove and floral lemon citrus blossom. Fruity, spicy aromas show a rich yeasty character on a smooth, medium-bodied palate. (Hefeweizen, ABV 5.5%, IBU 15)', 920.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-00000000005f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Beachshack (330ml)', 'Brilliant gold hue, creamy white head and big fresh hop aroma. Juicy American-style IPA packed with citrus and tropical fruit flavours. (West Coast IPA, ABV 6%, IBU 55)', 240.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000060', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Beachshack (500ml)', 'Brilliant gold hue, creamy white head and big fresh hop aroma. Juicy American-style IPA packed with citrus and tropical fruit flavours. (West Coast IPA, ABV 6%, IBU 55)', 320.00, '5-10 mins', 'serves 1', 'veg', 'available', array['bestseller']::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000061', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Beachshack (1.5L pitcher)', 'Brilliant gold hue, creamy white head and big fresh hop aroma. Juicy American-style IPA packed with citrus and tropical fruit flavours. (West Coast IPA, ABV 6%, IBU 55)', 920.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000062', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'No Parking (330ml)', 'Traditional northern German-style Pilsner brewed with all German malts and imported German Tettnang hops. Crisp and clean with a mildly salty noble hop bitterness. (German Pilsner, ABV 5.5%, IBU 41)', 240.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000063', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'No Parking (500ml)', 'Traditional northern German-style Pilsner brewed with all German malts and imported German Tettnang hops. Crisp and clean with a mildly salty noble hop bitterness. (German Pilsner, ABV 5.5%, IBU 41)', 320.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000064', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'No Parking (1.5L pitcher)', 'Traditional northern German-style Pilsner brewed with all German malts and imported German Tettnang hops. Crisp and clean with a mildly salty noble hop bitterness. (German Pilsner, ABV 5.5%, IBU 41)', 920.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000065', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Sumac (330ml)', 'A Belgian-style Witbier with lemony dried Middle-Eastern sumac berries instead of bitter orange peel, plus coriander seeds and fruity, spicy Belgian yeast esters. (Witbier, ABV 5.4%, IBU 15)', 240.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000066', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Sumac (500ml)', 'A Belgian-style Witbier with lemony dried Middle-Eastern sumac berries instead of bitter orange peel, plus coriander seeds and fruity, spicy Belgian yeast esters. (Witbier, ABV 5.4%, IBU 15)', 320.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000067', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Sumac (1.5L pitcher)', 'A Belgian-style Witbier with lemony dried Middle-Eastern sumac berries instead of bitter orange peel, plus coriander seeds and fruity, spicy Belgian yeast esters. (Witbier, ABV 5.4%, IBU 15)', 920.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-000000000068', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Raging Elephant (330ml)', 'Old-school American IPA with a coppery-gold hue and a full cascade hop aroma. Distinct ruby-red grapefruit quality on the palate through a long satisfying finish. (American IPA, ABV 6.8%, IBU 80)', 270.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000069', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Raging Elephant (500ml)', 'Old-school American IPA with a coppery-gold hue and a full cascade hop aroma. Distinct ruby-red grapefruit quality on the palate through a long satisfying finish. (American IPA, ABV 6.8%, IBU 80)', 370.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000006a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Raging Elephant (1.5L pitcher)', 'Old-school American IPA with a coppery-gold hue and a full cascade hop aroma. Distinct ruby-red grapefruit quality on the palate through a long satisfying finish. (American IPA, ABV 6.8%, IBU 80)', 1000.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000006b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Michael Faricy (330ml)', 'Enticing aromas of fresh-ground coffee and bittersweet chocolate. Chalky, roasted flavours balanced by lush dark chocolate through a smoky finish. (Irish Stout, ABV 5%, IBU 43)', 240.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000006c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Michael Faricy (500ml)', 'Enticing aromas of fresh-ground coffee and bittersweet chocolate. Chalky, roasted flavours balanced by lush dark chocolate through a smoky finish. (Irish Stout, ABV 5%, IBU 43)', 320.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000006d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Michael Faricy (1.5L pitcher)', 'Enticing aromas of fresh-ground coffee and bittersweet chocolate. Chalky, roasted flavours balanced by lush dark chocolate through a smoky finish. (Irish Stout, ABV 5%, IBU 43)', 920.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000006e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Smooth Criminal (330ml)', 'Brewed with lavender flowers and local forest honey. Lavender present on the nose and finish, never overbearing; honey contributes perceived sweetness with a slightly viscous mouthfeel. (Spiced Ale, ABV 8%, IBU 13)', 325.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-00000000006f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Smooth Criminal (500ml)', 'Brewed with lavender flowers and local forest honey. Lavender present on the nose and finish, never overbearing; honey contributes perceived sweetness with a slightly viscous mouthfeel. (Spiced Ale, ABV 8%, IBU 13)', 425.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000070', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000d', 'Smooth Criminal (1.5L pitcher)', 'Brewed with lavender flowers and local forest honey. Lavender present on the nose and finish, never overbearing; honey contributes perceived sweetness with a slightly viscous mouthfeel. (Spiced Ale, ABV 8%, IBU 13)', 1200.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000071', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000e', 'Bangalore Bliss (Can)', 'Canned Hefeweizen, 5.5% ABV.', 300.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000072', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000e', 'Beachshack (Can)', 'Canned West Coast IPA, 6% ABV.', 350.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000073', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000f', 'Hot Toddy', 'Brandy, Spices, Honey. 30ml standard measure.', 250.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000074', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000f', 'Cosmopolitan', 'Vodka, Triple Sec, Lime Juice. 30ml standard measure.', 325.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000075', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000f', 'Mojito', 'White Rum, Lime Juice, Soda. 30ml standard measure.', 325.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000076', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000f', 'Margarita', 'Tequila, Orange Liqueur, Lime Juice. 30ml standard measure.', 380.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000077', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000f', 'Pina Colada', 'White Rum, Coconut Cream, Pineapple Juice. 30ml standard measure.', 400.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000078', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000f', 'Long Island Iced Tea', 'Vodka, Tequila, White Rum, Gin, Triple Sec, Lime Juice, Coke. 30ml standard measure.', 500.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000079', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-00000000000f', 'Whisky Sour', 'Whisky, Egg White (Optional), Lime Juice. 30ml standard measure.', 600.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000007a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Bangalore Bliss Sangria (Glass)', 'House sangria, glass or pitcher.', 200.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000007b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Bangalore Bliss Sangria (Pitcher)', 'House sangria, glass or pitcher.', 800.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000007c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Red Wine Sangria (Glass)', 'Red wine sangria, glass or pitcher.', 450.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000007d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Red Wine Sangria (Pitcher)', 'Red wine sangria, glass or pitcher.', 2200.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000007e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'White Wine Sangria (Glass)', 'White wine sangria, glass or pitcher.', 450.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000007f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'White Wine Sangria (Pitcher)', 'White wine sangria, glass or pitcher.', 2200.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000080', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Shiraz Fruit (Glass)', 'Red wine.', 375.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000081', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Shiraz Fruit (Bottle)', 'Red wine.', 1750.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000082', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Shiraz Rose (Glass)', 'Rose wine.', 375.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000083', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Shiraz Rose (Bottle)', 'Rose wine.', 1750.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000084', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Sangiovese (Glass)', 'Red wine.', 450.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000085', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Sangiovese (Bottle)', 'Red wine.', 2200.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000086', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Sula Cabernet Shiraz (Glass)', 'Red wine.', 450.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000087', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Sula Cabernet Shiraz (Bottle)', 'Red wine.', 2150.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000088', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Lil James Basket Cosme Red', 'Red wine, bottle only.', 5750.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000089', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Robertson Red Wine', 'Red wine, bottle only.', 3600.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000008a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Chardonnay (Glass)', 'White wine, glass only.', 400.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000008b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Sauvignon Blanc (Glass)', 'White wine.', 400.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000008c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Fratelli Sauvignon Blanc (Bottle)', 'White wine.', 1900.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000008d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Sula Chenin Blanc (Glass)', 'White wine.', 375.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000008e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Sula Chenin Blanc (Bottle)', 'White wine.', 1750.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-00000000008f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Lil James Basket Cosme White', 'White wine, bottle only.', 5750.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000090', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000010', 'Robertson White Wine', 'White wine, bottle only.', 3600.00, '5-10 mins', 'serves 2-3', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000011', 'NOI Sparkling Wine', 'Sparkling wine, bottle.', 2250.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000011', 'Sula Brut', 'Sparkling wine, bottle.', 2750.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000093', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000011', 'Moet & Chandon', 'Champagne, bottle.', 9750.00, '5-10 mins', 'serves 4-5', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000094', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Fruit Punch', 'Mixed fruit mocktail.', 250.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000095', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Virgin Pina Colada', 'Coconut cream and pineapple juice, no rum.', 250.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000096', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Virgin Mary', 'Tomato-based mocktail, no vodka.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000097', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Watermelon Cooler', 'Fresh watermelon mocktail.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000098', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Virgin Mojito', 'Lime, mint and soda, no rum.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Passion Fruit Iced Tea', 'Iced tea, passion fruit.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-00000000009a', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Strawberry Iced Tea', 'Iced tea, strawberry.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-00000000009b', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Peach Iced Tea', 'Iced tea, peach.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-00000000009c', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Lemon Iced Tea', 'Iced tea, lemon.', 150.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-00000000009d', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Fresh Lime Soda', 'Sweet or salted, served with soda.', 120.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, true, true, 'active'),
	('40000000-0000-4000-8000-00000000009e', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Fresh Lime Water', 'Sweet or salted, still water.', 75.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, true, false, 'active'),
	('40000000-0000-4000-8000-00000000009f', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Mango Passion Kombucha', 'House kombucha, mango passion.', 380.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000a0', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Pomegranate Mint Kombucha', 'House kombucha, pomegranate mint.', 380.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000012', 'Ginger Lime Kombucha', 'House kombucha, ginger lime.', 380.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Paul John Nirvana', 'Single Malt Whisky. 30ml standard measure.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Ardmore Highland', 'Single Malt Whisky. 30ml standard measure.', 600.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Laphroaig', 'Single Malt Whisky. 30ml standard measure.', 675.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000a5', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Bowmore 12 y/o', 'Single Malt Whisky. 30ml standard measure.', 700.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000a6', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Glenlivet 12 y/o', 'Single Malt Whisky. 30ml standard measure.', 700.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000a7', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Desmondji 100%', 'Tequila. 30ml standard measure.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000a8', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Don Angel Blanco', 'Tequila. 30ml standard measure.', 300.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000a9', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Jose Cuervo Reposado', 'Tequila. 30ml standard measure.', 350.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000aa', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Patron XO Cafe', 'Tequila. 30ml standard measure.', 550.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ab', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', '1800 Reserva Silver', 'Tequila. 30ml standard measure.', 600.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ac', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Creyente Mezcal', 'Tequila. 30ml standard measure.', 700.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ad', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Patron Reposado', 'Tequila. 30ml standard measure.', 750.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ae', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', '1800 Reserva Anejo', 'Tequila. 30ml standard measure.', 750.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000af', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Old Monk', 'Rum. 30ml standard measure.', 200.00, '5-10 mins', 'serves 1', 'veg', 'sold_out', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b0', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Short Story White Rum', 'Rum. 30ml standard measure.', 250.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Kraken Black Spiced', 'Rum. 30ml standard measure.', 450.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Mount Gay Eclipse', 'Rum. 30ml standard measure.', 550.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b3', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Dipolmatico Reserva', 'Rum. 30ml standard measure.', 650.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b4', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Martell VS', 'Cognac. 30ml standard measure.', 625.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b5', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Hennessy VS', 'Cognac. 30ml standard measure.', 700.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b6', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Martell VSOP', 'Cognac. 30ml standard measure.', 900.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b7', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Hennessy VSOP', 'Cognac. 30ml standard measure.', 1000.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b8', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Martell XO', 'Cognac. 30ml standard measure.', 1200.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000b9', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'MC Brandy', 'Brandy. 30ml standard measure.', 200.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ba', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Mansion House', 'Brandy. 30ml standard measure.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000bb', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Greater Than', 'Gin. 30ml standard measure.', 250.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000bc', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Short Story Dry Gin', 'Gin. 30ml standard measure.', 250.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000bd', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Stranger & Sons', 'Gin. 30ml standard measure.', 300.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000be', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Stranger & Sons x The Bombay Canteen: Perry Road Peru', 'Gin. 30ml standard measure.', 375.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000bf', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Hapusa Himalayan Dry Gin', 'Gin. 30ml standard measure.', 400.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c0', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Hendricks', 'Gin. 30ml standard measure.', 600.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Roku Gin', 'Gin. 30ml standard measure.', 650.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c2', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Sipsmith London Dry Gin', 'Gin. 30ml standard measure.', 650.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c3', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Monkey 47', 'Gin. 30ml standard measure.', 800.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c4', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Short Story Grain Vodka', 'Vodka. 30ml standard measure.', 250.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c5', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Absolut Vodka Blue', 'Vodka. 30ml standard measure.', 370.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c6', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Tito''s Handmade Vodka', 'Vodka. 30ml standard measure.', 550.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c7', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Ciroc Vodka', 'Vodka. 30ml standard measure.', 600.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c8', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Grey Goose', 'Vodka. 30ml standard measure.', 650.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000c9', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Belvedere', 'Vodka. 30ml standard measure.', 650.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ca', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Desmondji Orange', 'Liqueur. 30ml standard measure.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000cb', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Kahlua', 'Liqueur. 30ml standard measure.', 375.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000cc', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Baileys', 'Liqueur. 30ml standard measure.', 575.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000cd', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Jagermeister', 'Liqueur. 30ml standard measure.', 575.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ce', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Kamikaze', 'Shooter. 30ml standard measure.', 200.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000cf', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Good Day Soju', 'Shooter. 30ml standard measure.', 200.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d0', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Snake Bite', 'Shooter. 30ml standard measure.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Tequila Slammer', 'Shooter. 30ml standard measure.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d2', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Melon Ball', 'Shooter. 30ml standard measure.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d3', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'B-52', 'Shooter. 30ml standard measure.', 500.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d4', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Jager-Bomb', 'Shooter. 30ml standard measure.', 550.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d5', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Irish Car Bomb', 'Shooter. 30ml standard measure.', 550.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d6', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Good Day Soju Bottle', 'Shooter. 30ml standard measure.', 1900.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d7', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Martini Bianco', 'Aperitif. 30ml standard measure.', 180.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d8', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Martini Extra Dry', 'Aperitif. 30ml standard measure.', 180.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000d9', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Martini Rosso', 'Aperitif. 30ml standard measure.', 180.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000da', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Aperol', 'Aperitif. 30ml standard measure.', 350.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000db', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000013', 'Campari', 'Aperitif. 30ml standard measure.', 575.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], true, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000dc', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Oaksmith', 'Whisky. 30ml standard measure.', 200.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000dd', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Teacher''s Highland', 'Whisky. 30ml standard measure.', 225.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000de', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Jameson Irish Whisky', 'Whisky. 30ml standard measure.', 325.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000df', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Teacher''s 50', 'Whisky. 30ml standard measure.', 325.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e0', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Teacher''s Golden 12 y/o', 'Whisky. 30ml standard measure.', 450.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Chivas Regal', 'Whisky. 30ml standard measure.', 500.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e2', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'JW Black Label', 'Whisky. 30ml standard measure.', 500.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e3', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Monkey Shoulder', 'Whisky. 30ml standard measure.', 600.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e4', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Toki Suntory', 'Whisky. 30ml standard measure.', 600.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e5', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Royal Salute 21 y/o', 'Whisky. 30ml standard measure.', 1100.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e6', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Jim Beam White', 'Bourbon whisky. 30ml standard measure.', 300.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e7', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Jim Beam Black', 'Bourbon whisky. 30ml standard measure.', 450.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e8', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Jack Daniels'' Tennessee', 'Bourbon whisky. 30ml standard measure.', 450.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000e9', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Maker''s Mark', 'Bourbon whisky. 30ml standard measure.', 525.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ea', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Gentleman Jack', 'Bourbon whisky. 30ml standard measure.', 525.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000eb', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000014', 'Michter''s Bourbon', 'Bourbon whisky. 30ml standard measure.', 725.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ec', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Espresso', 'Single shot espresso.', 100.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ed', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Double Espresso', 'Double shot espresso.', 150.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ee', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Americano', 'Espresso with hot water.', 150.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000ef', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Iced Americano', 'Espresso with cold water over ice.', 150.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000f0', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Cafe Latte', 'Espresso with steamed milk.', 180.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Cappuccino', 'Espresso with steamed milk foam.', 180.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000f2', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Cold Shakerato', 'Shaken iced espresso.', 180.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000f3', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Lemon Tea', 'Black tea with lemon.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000f4', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Earl Grey Tea', 'Classic bergamot black tea.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000f5', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Green Tea', 'Steeped green tea.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-0000000000f6', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Apple Juice', 'Freshly served juice.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000f7', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Cranberry Juice', 'Freshly served juice.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000f8', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Guava Juice', 'Freshly served juice.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000f9', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Orange Juice', 'Freshly served juice.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000fa', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Grape Juice', 'Freshly served juice.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000fb', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Litchi Juice', 'Freshly served juice.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000fc', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Mango Juice', 'Freshly served juice.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000fd', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Pineapple Juice', 'Freshly served juice.', 125.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000fe', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Soda', 'Plain soda.', 75.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-0000000000ff', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Diet Coke', 'Diet cola.', 100.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000100', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Coke', 'Cola.', 100.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Sprite', 'Lemon-lime soda.', 100.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Arbor Water Bottle', 'Packaged drinking water.', 120.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, false, 'active'),
	('40000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Ginger Ale', 'Ginger ale soda.', 150.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Tonic Water', 'Tonic water.', 150.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active'),
	('40000000-0000-4000-8000-000000000105', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000015', 'Redbull', 'Energy drink, canned.', 250.00, '5-10 mins', 'serves 1', 'veg', 'available', array[]::text[], false, false, true, 'active')
on conflict (id) do nothing;

-- 22 active table sessions — 21 single-table + 1 four-table merge
-- (T20/T21/T22/T23 sharing one session: T21-23 were free tables merged into
-- T20's session, per the MVP 'merge only absorbs a free table' rule).
insert into sessions (id, restaurant_id, status, opened_at, closed_at) values
	('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '149 minutes', null),
	('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '108 minutes', null),
	('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '148 minutes', null),
	('50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '126 minutes', null),
	('50000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '98 minutes', null),
	('50000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '82 minutes', null),
	('50000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '78 minutes', null),
	('50000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '32 minutes', null),
	('50000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '20 minutes', null),
	('50000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '106 minutes', null),
	('50000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '60 minutes', null),
	('50000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '79 minutes', null),
	('50000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '122 minutes', null),
	('50000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '80 minutes', null),
	('50000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '74 minutes', null),
	('50000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '122 minutes', null),
	('50000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '54 minutes', null),
	('50000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '55 minutes', null),
	('50000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '103 minutes', null),
	('50000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '48 minutes', null),
	('50000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '57 minutes', null),
	('50000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000002', 'active', now() - interval '170 minutes', null)
on conflict (id) do nothing;

-- 3 historical closed sessions (already turned over and settled earlier
-- today) — exercises the settled-bill / closed-session read paths.
insert into sessions (id, restaurant_id, status, opened_at, closed_at) values
	('50000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000002', 'closed', now() - interval '284 minutes', now() - interval '216 minutes'),
	('50000000-0000-4000-8000-00000000001a', '10000000-0000-4000-8000-000000000002', 'closed', now() - interval '330 minutes', now() - interval '276 minutes'),
	('50000000-0000-4000-8000-00000000001b', '10000000-0000-4000-8000-000000000002', 'closed', now() - interval '352 minutes', now() - interval '298 minutes')
on conflict (id) do nothing;

-- 30 restaurant tables — 5 free (T26-T30), 21 single-seated, 4 merged into
-- one session (T20-T23). T15 is a long communal table: one qr_token, but
-- printed on 3 placards along its length, so several phones scan the exact
-- same code into the exact same session simultaneously (expected, not a
-- bug) — reflected here by T15 carrying unusually heavy multi-guest,
-- no-staff-assist order activity rather than by any extra row.
insert into restaurant_tables (id, restaurant_id, label, qr_token, session_id) values
	('60000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'T1', 'arbor-qr-table-t1', '50000000-0000-4000-8000-000000000003'),
	('60000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'T2', 'arbor-qr-table-t2', '50000000-0000-4000-8000-000000000004'),
	('60000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'T3', 'arbor-qr-table-t3', '50000000-0000-4000-8000-000000000005'),
	('60000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'T4', 'arbor-qr-table-t4', '50000000-0000-4000-8000-000000000006'),
	('60000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', 'T5', 'arbor-qr-table-t5', '50000000-0000-4000-8000-000000000007'),
	('60000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', 'T6', 'arbor-qr-table-t6', '50000000-0000-4000-8000-000000000008'),
	('60000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002', 'T7', 'arbor-qr-table-t7', '50000000-0000-4000-8000-000000000009'),
	('60000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000002', 'T8', 'arbor-qr-table-t8', '50000000-0000-4000-8000-00000000000a'),
	('60000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000002', 'T9', 'arbor-qr-table-t9', '50000000-0000-4000-8000-00000000000b'),
	('60000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000002', 'T10', 'arbor-qr-table-t10', '50000000-0000-4000-8000-00000000000c'),
	('60000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000002', 'T11', 'arbor-qr-table-t11', '50000000-0000-4000-8000-00000000000d'),
	('60000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', 'T12', 'arbor-qr-table-t12', '50000000-0000-4000-8000-00000000000e'),
	('60000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', 'T13', 'arbor-qr-table-t13', '50000000-0000-4000-8000-00000000000f'),
	('60000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', 'T14', 'arbor-qr-table-t14', '50000000-0000-4000-8000-000000000010'),
	('60000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000002', 'T15', 'arbor-qr-table-t15', '50000000-0000-4000-8000-000000000011'),
	('60000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000002', 'T16', 'arbor-qr-table-t16', '50000000-0000-4000-8000-000000000012'),
	('60000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000002', 'T17', 'arbor-qr-table-t17', '50000000-0000-4000-8000-000000000013'),
	('60000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000002', 'T18', 'arbor-qr-table-t18', '50000000-0000-4000-8000-000000000014'),
	('60000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000002', 'T19', 'arbor-qr-table-t19', '50000000-0000-4000-8000-000000000015'),
	('60000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000002', 'T20', 'arbor-qr-table-t20', '50000000-0000-4000-8000-000000000018'),
	('60000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000002', 'T21', 'arbor-qr-table-t21', '50000000-0000-4000-8000-000000000018'),
	('60000000-0000-4000-8000-00000000001a', '10000000-0000-4000-8000-000000000002', 'T22', 'arbor-qr-table-t22', '50000000-0000-4000-8000-000000000018'),
	('60000000-0000-4000-8000-00000000001b', '10000000-0000-4000-8000-000000000002', 'T23', 'arbor-qr-table-t23', '50000000-0000-4000-8000-000000000018'),
	('60000000-0000-4000-8000-00000000001c', '10000000-0000-4000-8000-000000000002', 'T24', 'arbor-qr-table-t24', '50000000-0000-4000-8000-000000000016'),
	('60000000-0000-4000-8000-00000000001d', '10000000-0000-4000-8000-000000000002', 'T25', 'arbor-qr-table-t25', '50000000-0000-4000-8000-000000000017'),
	('60000000-0000-4000-8000-00000000001e', '10000000-0000-4000-8000-000000000002', 'T26', 'arbor-qr-table-t26', null),
	('60000000-0000-4000-8000-00000000001f', '10000000-0000-4000-8000-000000000002', 'T27', 'arbor-qr-table-t27', null),
	('60000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000002', 'T28', 'arbor-qr-table-t28', null),
	('60000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000002', 'T29', 'arbor-qr-table-t29', null),
	('60000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000002', 'T30', 'arbor-qr-table-t30', null)
on conflict (id) do nothing;

-- Uncommitted cart items — guests/waiter mid-browse, next round not yet
-- confirmed. Includes one staff-added line (waiter ordering on a guest's
-- behalf), covering the added_by_type = staff case.
insert into cart_items (id, restaurant_id, session_id, menu_item_id, quantity, spice, salt, ice, added_by_type, added_by_staff_id) values
	('70000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-00000000005a', 2, null, null, null, 'guest', null),
	('70000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-00000000001b', 1, null, null, null, 'guest', null),
	('70000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000030', 2, null, null, null, 'guest', null),
	('70000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-0000000000ec', 1, null, null, null, 'staff', '20000000-0000-4000-8000-00000000000c')
on conflict (id) do nothing;

-- 76 orders (rounds) — 1 to 6 completed rounds per active table,
-- plus one live 'current round' per table feeding the rush-hour kitchen
-- queue below. Distinct idempotency_key per order (globally unique column).
insert into orders (id, restaurant_id, session_id, placed_at, placed_by_type, placed_by_staff_id, idempotency_key) values
	('80000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003', now() - interval '149 minutes', 'guest', null, 'arbor-order-1'),
	('80000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', now() - interval '108 minutes', 'guest', null, 'arbor-order-2'),
	('80000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000005', now() - interval '148 minutes', 'guest', null, 'arbor-order-3'),
	('80000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', now() - interval '126 minutes', 'guest', null, 'arbor-order-4'),
	('80000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', now() - interval '84 minutes', 'guest', null, 'arbor-order-5'),
	('80000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000007', now() - interval '98 minutes', 'guest', null, 'arbor-order-6'),
	('80000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000008', now() - interval '82 minutes', 'guest', null, 'arbor-order-7'),
	('80000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000008', now() - interval '62 minutes', 'guest', null, 'arbor-order-8'),
	('80000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000008', now() - interval '42 minutes', 'staff', '20000000-0000-4000-8000-00000000000a', 'arbor-order-9'),
	('80000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000009', now() - interval '78 minutes', 'staff', '20000000-0000-4000-8000-00000000000c', 'arbor-order-10'),
	('80000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000009', now() - interval '65 minutes', 'staff', '20000000-0000-4000-8000-00000000000b', 'arbor-order-11'),
	('80000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000009', now() - interval '52 minutes', 'guest', null, 'arbor-order-12'),
	('80000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000009', now() - interval '39 minutes', 'guest', null, 'arbor-order-13'),
	('80000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000009', now() - interval '26 minutes', 'guest', null, 'arbor-order-14'),
	('80000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000a', now() - interval '32 minutes', 'guest', null, 'arbor-order-15'),
	('80000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000b', now() - interval '20 minutes', 'guest', null, 'arbor-order-16'),
	('80000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000b', now() - interval '14 minutes', 'staff', '20000000-0000-4000-8000-00000000000c', 'arbor-order-17'),
	('80000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000c', now() - interval '106 minutes', 'guest', null, 'arbor-order-18'),
	('80000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000c', now() - interval '80 minutes', 'staff', '20000000-0000-4000-8000-00000000000a', 'arbor-order-19'),
	('80000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000c', now() - interval '54 minutes', 'staff', '20000000-0000-4000-8000-00000000000c', 'arbor-order-20'),
	('80000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000d', now() - interval '60 minutes', 'staff', '20000000-0000-4000-8000-00000000000b', 'arbor-order-21'),
	('80000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000d', now() - interval '45 minutes', 'guest', null, 'arbor-order-22'),
	('80000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000d', now() - interval '30 minutes', 'guest', null, 'arbor-order-23'),
	('80000000-0000-4000-8000-00000000001a', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000e', now() - interval '79 minutes', 'staff', '20000000-0000-4000-8000-000000000009', 'arbor-order-24'),
	('80000000-0000-4000-8000-00000000001b', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000f', now() - interval '122 minutes', 'guest', null, 'arbor-order-25'),
	('80000000-0000-4000-8000-00000000001c', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000010', now() - interval '80 minutes', 'guest', null, 'arbor-order-26'),
	('80000000-0000-4000-8000-00000000001d', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000011', now() - interval '74 minutes', 'guest', null, 'arbor-order-27'),
	('80000000-0000-4000-8000-00000000001e', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000011', now() - interval '62 minutes', 'guest', null, 'arbor-order-28'),
	('80000000-0000-4000-8000-00000000001f', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000011', now() - interval '50 minutes', 'guest', null, 'arbor-order-29'),
	('80000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000011', now() - interval '38 minutes', 'guest', null, 'arbor-order-30'),
	('80000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000011', now() - interval '26 minutes', 'guest', null, 'arbor-order-31'),
	('80000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000012', now() - interval '122 minutes', 'staff', '20000000-0000-4000-8000-00000000000e', 'arbor-order-32'),
	('80000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000013', now() - interval '54 minutes', 'guest', null, 'arbor-order-33'),
	('80000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000014', now() - interval '55 minutes', 'guest', null, 'arbor-order-34'),
	('80000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000014', now() - interval '37 minutes', 'staff', '20000000-0000-4000-8000-000000000009', 'arbor-order-35'),
	('80000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000015', now() - interval '103 minutes', 'guest', null, 'arbor-order-36'),
	('80000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000015', now() - interval '69 minutes', 'guest', null, 'arbor-order-37'),
	('80000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000016', now() - interval '48 minutes', 'guest', null, 'arbor-order-38'),
	('80000000-0000-4000-8000-000000000029', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000017', now() - interval '57 minutes', 'staff', '20000000-0000-4000-8000-00000000000a', 'arbor-order-39'),
	('80000000-0000-4000-8000-00000000002a', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000018', now() - interval '170 minutes', 'staff', '20000000-0000-4000-8000-00000000000d', 'arbor-order-40'),
	('80000000-0000-4000-8000-00000000002b', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000018', now() - interval '142 minutes', 'guest', null, 'arbor-order-41'),
	('80000000-0000-4000-8000-00000000002c', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000018', now() - interval '114 minutes', 'guest', null, 'arbor-order-42'),
	('80000000-0000-4000-8000-00000000002d', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000018', now() - interval '86 minutes', 'guest', null, 'arbor-order-43'),
	('80000000-0000-4000-8000-00000000002e', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000018', now() - interval '58 minutes', 'staff', '20000000-0000-4000-8000-00000000000e', 'arbor-order-44'),
	('80000000-0000-4000-8000-00000000002f', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003', now() - interval '149 minutes', 'guest', null, 'arbor-order-45'),
	('80000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', now() - interval '45 minutes', 'staff', '20000000-0000-4000-8000-00000000000a', 'arbor-order-46'),
	('80000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000019', now() - interval '284 minutes', 'staff', '20000000-0000-4000-8000-00000000000d', 'arbor-order-47'),
	('80000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000019', now() - interval '264 minutes', 'guest', null, 'arbor-order-48'),
	('80000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000019', now() - interval '244 minutes', 'guest', null, 'arbor-order-49'),
	('80000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001a', now() - interval '330 minutes', 'staff', '20000000-0000-4000-8000-00000000000b', 'arbor-order-50'),
	('80000000-0000-4000-8000-000000000035', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001a', now() - interval '310 minutes', 'guest', null, 'arbor-order-51'),
	('80000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001a', now() - interval '290 minutes', 'guest', null, 'arbor-order-52'),
	('80000000-0000-4000-8000-000000000037', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001a', now() - interval '270 minutes', 'guest', null, 'arbor-order-53'),
	('80000000-0000-4000-8000-000000000038', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001b', now() - interval '352 minutes', 'guest', null, 'arbor-order-54'),
	('80000000-0000-4000-8000-000000000039', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001b', now() - interval '332 minutes', 'staff', '20000000-0000-4000-8000-00000000000a', 'arbor-order-55'),
	('80000000-0000-4000-8000-00000000003a', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001b', now() - interval '312 minutes', 'staff', '20000000-0000-4000-8000-00000000000e', 'arbor-order-56'),
	('80000000-0000-4000-8000-00000000003b', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000a', now() - interval '15 minutes', 'staff', '20000000-0000-4000-8000-00000000000e', 'arbor-order-57'),
	('80000000-0000-4000-8000-00000000003c', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', now() - interval '15 minutes', 'staff', '20000000-0000-4000-8000-00000000000c', 'arbor-order-58'),
	('80000000-0000-4000-8000-00000000003d', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000d', now() - interval '8 minutes', 'guest', null, 'arbor-order-59'),
	('80000000-0000-4000-8000-00000000003e', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000006', now() - interval '11 minutes', 'staff', '20000000-0000-4000-8000-00000000000e', 'arbor-order-60'),
	('80000000-0000-4000-8000-00000000003f', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000b', now() - interval '3 minutes', 'staff', '20000000-0000-4000-8000-00000000000a', 'arbor-order-61'),
	('80000000-0000-4000-8000-000000000040', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000009', now() - interval '8 minutes', 'guest', null, 'arbor-order-62'),
	('80000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000012', now() - interval '11 minutes', 'guest', null, 'arbor-order-63'),
	('80000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000008', now() - interval '3 minutes', 'guest', null, 'arbor-order-64'),
	('80000000-0000-4000-8000-000000000043', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000005', now() - interval '5 minutes', 'staff', '20000000-0000-4000-8000-00000000000d', 'arbor-order-65'),
	('80000000-0000-4000-8000-000000000044', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000011', now() - interval '13 minutes', 'guest', null, 'arbor-order-66'),
	('80000000-0000-4000-8000-000000000045', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000015', now() - interval '18 minutes', 'guest', null, 'arbor-order-67'),
	('80000000-0000-4000-8000-000000000046', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000e', now() - interval '17 minutes', 'staff', '20000000-0000-4000-8000-00000000000d', 'arbor-order-68'),
	('80000000-0000-4000-8000-000000000047', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000016', now() - interval '8 minutes', 'guest', null, 'arbor-order-69'),
	('80000000-0000-4000-8000-000000000048', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000010', now() - interval '3 minutes', 'staff', '20000000-0000-4000-8000-00000000000a', 'arbor-order-70'),
	('80000000-0000-4000-8000-000000000049', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000014', now() - interval '15 minutes', 'guest', null, 'arbor-order-71'),
	('80000000-0000-4000-8000-00000000004a', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000013', now() - interval '8 minutes', 'staff', '20000000-0000-4000-8000-00000000000d', 'arbor-order-72'),
	('80000000-0000-4000-8000-00000000004b', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000f', now() - interval '10 minutes', 'staff', '20000000-0000-4000-8000-000000000009', 'arbor-order-73'),
	('80000000-0000-4000-8000-00000000004c', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000000c', now() - interval '10 minutes', 'staff', '20000000-0000-4000-8000-00000000000e', 'arbor-order-74'),
	('80000000-0000-4000-8000-00000000004d', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000017', now() - interval '14 minutes', 'guest', null, 'arbor-order-75'),
	('80000000-0000-4000-8000-00000000004e', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000008', now() - interval '14 minutes', 'guest', null, 'arbor-order-76')
on conflict (id) do nothing;

-- 178 order items. Rush-hour queue: 10 distinct dishes at
-- 'placed', 8 at 'preparing' (2 deliberately over the 8-minute overdue
-- threshold), 7 at 'ready' — each dish batch fed by 1-4 different tables,
-- so the kitchen display shows the same dish arriving from multiple tables
-- at once, exactly like real rush-hour firing.
insert into order_items (id, restaurant_id, order_id, item_name, unit_price, tax_rate, diet, quantity, status, preparing_at, ready_at, menu_item_id) values
	('90000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', 'Mediterranean Lamb Burger', 550.00, 0.0500, 'non_veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000055'),
	('90000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000003', 'Gentleman Jack', 525.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000ea'),
	('90000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000004', 'Healthy Bites', 150.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-00000000001a'),
	('90000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000004', 'Chilli Fish', 350.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000046'),
	('90000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000004', 'Salt & Pepper Prawn', 400.00, 0.0500, 'non_veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000045'),
	('90000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000004', 'Hummus Plate', 250.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000000d'),
	('90000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000005', 'Heavenly Drumsticks', 325.00, 0.0500, 'non_veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000011'),
	('90000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000005', 'Cauliflower Wings', 250.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000051'),
	('90000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000005', 'Stranger & Sons x The Bombay Canteen: Perry Road Peru', 375.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000be'),
	('90000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000006', 'Spinach & Artichoke Dip', 325.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000004e'),
	('90000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000007', 'Buffalo Soldier', 550.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000002c'),
	('90000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000007', 'No Parking (500ml)', 320.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000063'),
	('90000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000007', 'Turkish Lamb Kebab', 460.00, 0.0500, 'non_veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000044'),
	('90000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000007', 'Margherita', 480.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000027'),
	('90000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000008', 'Aperol', 350.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000da'),
	('90000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000008', 'Flaming Chicken', 370.00, 0.0500, 'non_veg', 3, 'served', null, null, '40000000-0000-4000-8000-00000000000c'),
	('90000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000009', 'Patron XO Cafe', 550.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000aa'),
	('90000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000009', 'Vegan BBQ Harissa Mushroom Slider', 325.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000012'),
	('90000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000009', 'Salt & Pepper Prawn', 400.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000045'),
	('90000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000009', 'Watermelon Cooler', 225.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000097'),
	('90000000-0000-4000-8000-00000000001a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000a', 'NOI Sparkling Wine', 2250.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000091'),
	('90000000-0000-4000-8000-00000000001b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000b', 'Bangalore Bliss (1.5L pitcher)', 920.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000005e'),
	('90000000-0000-4000-8000-00000000001c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000b', 'Oaksmith', 200.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000dc'),
	('90000000-0000-4000-8000-00000000001d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000c', 'Baked Mac & Cheese', 320.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000021'),
	('90000000-0000-4000-8000-00000000001e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000d', 'Mediterranean Salad', 320.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000035'),
	('90000000-0000-4000-8000-00000000001f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000d', 'Tiramisu', 260.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000030'),
	('90000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000d', 'Tito''s Handmade Vodka', 550.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000c6'),
	('90000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000e', 'Chilli Cheese Garlic Toast', 300.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-00000000004a'),
	('90000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000e', 'No Parking (330ml)', 240.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000062'),
	('90000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000e', 'Grilled Chicken', 380.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000001d'),
	('90000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000000f', 'Hennessy VSOP', 1000.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000b7'),
	('90000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000010', 'Beet Salad w/ Goat Cheese & Balsamic', 320.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000037'),
	('90000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000011', 'Cajun Style Fried Devilled Eggs', 280.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000049'),
	('90000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000011', 'Good Day Soju Bottle', 1900.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000d6'),
	('90000000-0000-4000-8000-000000000028', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000012', 'Bangalore Bliss (500ml)', 320.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000005d'),
	('90000000-0000-4000-8000-000000000029', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000013', 'Beet Salad w/ Goat Cheese & Balsamic', 320.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000037'),
	('90000000-0000-4000-8000-00000000002a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000013', 'Guava Juice', 125.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000f8'),
	('90000000-0000-4000-8000-00000000002b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000014', 'Chilli Cheese Bacon Fries', 550.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000000a'),
	('90000000-0000-4000-8000-00000000002c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000014', 'Grilled Greek Lamb Souvlaki', 550.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000004f'),
	('90000000-0000-4000-8000-00000000002d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000014', 'Irish Car Bomb', 550.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000d5'),
	('90000000-0000-4000-8000-00000000002e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000015', 'Toki Suntory', 600.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000e4'),
	('90000000-0000-4000-8000-00000000002f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000015', 'Mediterranean Bowl', 530.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000001e'),
	('90000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000016', 'White Wine Sangria (Pitcher)', 2200.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000007f'),
	('90000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000016', 'Moet & Chandon', 9750.00, 0.1800, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000093'),
	('90000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000016', 'Hennessy VSOP', 1000.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000b7'),
	('90000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000016', 'Old School Chilli Chicken', 380.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000004b'),
	('90000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000017', 'Cafe Latte', 180.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000f0'),
	('90000000-0000-4000-8000-000000000035', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000018', 'Jameson Irish Whisky', 325.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000de'),
	('90000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000018', 'Spicy Fried Calamari', 370.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000013'),
	('90000000-0000-4000-8000-000000000037', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000019', 'Caramel Drizzled Brownie', 350.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000032'),
	('90000000-0000-4000-8000-000000000038', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000019', 'Vegan BBQ Harissa Mushroom Slider', 325.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000012'),
	('90000000-0000-4000-8000-000000000039', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000019', 'Citrus Marinated Fish Fingers', 375.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000048'),
	('90000000-0000-4000-8000-00000000003a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000019', 'Buffalo Soldier', 550.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000002c'),
	('90000000-0000-4000-8000-00000000003b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001a', 'Glenlivet 12 y/o', 700.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000a6'),
	('90000000-0000-4000-8000-00000000003c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001b', 'Chicken Wings', 325.00, 0.0500, 'non_veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000052'),
	('90000000-0000-4000-8000-00000000003d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001b', 'Margherita', 480.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000027'),
	('90000000-0000-4000-8000-00000000003e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001c', 'Smoked Chicken Quesadilla', 425.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000014'),
	('90000000-0000-4000-8000-00000000003f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001d', 'Patron Reposado', 750.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000ad'),
	('90000000-0000-4000-8000-000000000040', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001d', 'Garden', 500.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000002b'),
	('90000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001d', 'Green Tea', 125.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000f5'),
	('90000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001e', 'Redbull', 250.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000105'),
	('90000000-0000-4000-8000-000000000043', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001e', 'Chicken Club Pizza', 550.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000029'),
	('90000000-0000-4000-8000-000000000044', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001e', 'Martell VSOP', 900.00, 0.1800, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-0000000000b6'),
	('90000000-0000-4000-8000-000000000045', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000001f', 'Kamikaze', 200.00, 0.1800, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-0000000000ce'),
	('90000000-0000-4000-8000-000000000046', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000020', 'The Arbor-ger', 500.00, 0.0500, 'non_veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000053'),
	('90000000-0000-4000-8000-000000000047', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000020', 'Citrus Marinated Fish Fingers', 375.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000048'),
	('90000000-0000-4000-8000-000000000048', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000020', 'Fratelli Sauvignon Blanc (Bottle)', 1900.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000008c'),
	('90000000-0000-4000-8000-000000000049', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000020', 'Beachshack (1.5L pitcher)', 920.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000061'),
	('90000000-0000-4000-8000-00000000004a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000021', 'Chilli Cheese Garlic Toast', 300.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-00000000004a'),
	('90000000-0000-4000-8000-00000000004b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000022', 'Pomegranate Mint Kombucha', 380.00, 0.1800, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-0000000000a0'),
	('90000000-0000-4000-8000-00000000004c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000022', 'Virgin Mojito', 225.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000098'),
	('90000000-0000-4000-8000-00000000004d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000022', 'Green Tea', 125.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000f5'),
	('90000000-0000-4000-8000-00000000004e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000022', 'Fiery Chicken Alfredo', 430.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000001f'),
	('90000000-0000-4000-8000-00000000004f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000023', 'Cappuccino', 180.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000f1'),
	('90000000-0000-4000-8000-000000000050', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000024', 'Aperol', 350.00, 0.1800, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-0000000000da'),
	('90000000-0000-4000-8000-000000000051', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000024', 'Fiery Chicken Alfredo', 430.00, 0.0500, 'non_veg', 3, 'served', null, null, '40000000-0000-4000-8000-00000000001f'),
	('90000000-0000-4000-8000-000000000052', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000024', 'Spiced Marinated Olives', 180.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000001c'),
	('90000000-0000-4000-8000-000000000053', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000025', 'Old School Chilli Chicken', 380.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000004b'),
	('90000000-0000-4000-8000-000000000054', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000026', 'Raging Elephant (1.5L pitcher)', 1000.00, 0.1800, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-00000000006a'),
	('90000000-0000-4000-8000-000000000055', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000026', 'Chivas Regal', 500.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000e1'),
	('90000000-0000-4000-8000-000000000056', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000027', 'Mediterranean Salad', 320.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000035'),
	('90000000-0000-4000-8000-000000000057', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000027', 'Greek Passion', 480.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-00000000002a'),
	('90000000-0000-4000-8000-000000000058', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000027', 'Greek Passion', 480.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000002a'),
	('90000000-0000-4000-8000-000000000059', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000028', 'Tex Mex Black Bean Burger', 380.00, 0.0500, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-000000000054'),
	('90000000-0000-4000-8000-00000000005a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000029', 'Fratelli Chardonnay (Glass)', 400.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000008a'),
	('90000000-0000-4000-8000-00000000005b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000029', 'Ginger Beef Stir-Fry', 460.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000003f'),
	('90000000-0000-4000-8000-00000000005c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002a', 'Baked Mac & Cheese', 320.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000021'),
	('90000000-0000-4000-8000-00000000005d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002a', 'Michael Faricy (330ml)', 240.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000006b'),
	('90000000-0000-4000-8000-00000000005e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002b', 'BBQ Chicken Tacos', 325.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000003a'),
	('90000000-0000-4000-8000-00000000005f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002b', 'Roku Gin', 650.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000c1'),
	('90000000-0000-4000-8000-000000000060', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002b', 'Iced Americano', 150.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-0000000000ef'),
	('90000000-0000-4000-8000-000000000061', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002b', 'Martini Rosso', 180.00, 0.1800, 'veg', 3, 'served', null, null, '40000000-0000-4000-8000-0000000000d9'),
	('90000000-0000-4000-8000-000000000062', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002c', 'Chilli Cheese Bacon Fries', 550.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000000a'),
	('90000000-0000-4000-8000-000000000063', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002c', 'Beet Salad w/ Goat Cheese & Balsamic', 320.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000037'),
	('90000000-0000-4000-8000-000000000064', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002d', 'Grey Goose', 650.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000c8'),
	('90000000-0000-4000-8000-000000000065', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002e', 'Kraken Black Spiced', 450.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000b1'),
	('90000000-0000-4000-8000-000000000066', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002e', 'Martell VSOP', 900.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000b6'),
	('90000000-0000-4000-8000-000000000067', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002e', 'Beet Salad w/ Goat Cheese & Balsamic', 320.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000037'),
	('90000000-0000-4000-8000-000000000068', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002e', 'Teacher''s 50', 325.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000df'),
	('90000000-0000-4000-8000-000000000069', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002f', 'Banoffee Pie', 240.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000031'),
	('90000000-0000-4000-8000-00000000006a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000002f', 'Grilled Salmon', 900.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000026'),
	('90000000-0000-4000-8000-00000000006b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000030', 'Chicken Club Pizza', 550.00, 0.0500, 'non_veg', 1, 'cancelled', null, null, '40000000-0000-4000-8000-000000000029'),
	('90000000-0000-4000-8000-00000000006c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000030', 'Coke', 100.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000100'),
	('90000000-0000-4000-8000-00000000006d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000031', 'Fiery Chicken Alfredo', 430.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000001f'),
	('90000000-0000-4000-8000-00000000006e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000031', 'Margherita', 480.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000027'),
	('90000000-0000-4000-8000-00000000006f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000031', 'Caramel Drizzled Brownie', 350.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000032'),
	('90000000-0000-4000-8000-000000000070', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000032', 'Fiery Chicken Alfredo', 430.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000001f'),
	('90000000-0000-4000-8000-000000000071', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000032', 'Turkish Pide', 250.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000050'),
	('90000000-0000-4000-8000-000000000072', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000033', 'Martini Extra Dry', 180.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-0000000000d8'),
	('90000000-0000-4000-8000-000000000073', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000033', 'Whisky Sour', 600.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000079'),
	('90000000-0000-4000-8000-000000000074', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000033', 'Roasted Cauliflower Tacos', 285.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000003c'),
	('90000000-0000-4000-8000-000000000075', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000034', 'BBQ Chicken Tacos', 325.00, 0.0500, 'non_veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000003a'),
	('90000000-0000-4000-8000-000000000076', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000034', 'Fratelli Chardonnay (Glass)', 400.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000008a'),
	('90000000-0000-4000-8000-000000000077', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000034', 'Lemon Meringue Pie', 260.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000033'),
	('90000000-0000-4000-8000-000000000078', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000035', 'Grilled Greek Lamb Souvlaki', 550.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000004f'),
	('90000000-0000-4000-8000-000000000079', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000036', 'Sula Chenin Blanc (Bottle)', 1750.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000008e'),
	('90000000-0000-4000-8000-00000000007a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000036', 'Pub Fries', 260.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000004d'),
	('90000000-0000-4000-8000-00000000007b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000036', 'Arbor Loaded Nachos', 420.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000009'),
	('90000000-0000-4000-8000-00000000007c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000037', 'Sula Cabernet Shiraz (Bottle)', 2150.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000087'),
	('90000000-0000-4000-8000-00000000007d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000038', 'Lemon Meringue Pie', 260.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000033'),
	('90000000-0000-4000-8000-00000000007e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000039', 'Turkish Pide', 250.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000050'),
	('90000000-0000-4000-8000-00000000007f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000039', 'Arbor Loaded Nachos', 420.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000009'),
	('90000000-0000-4000-8000-000000000080', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000039', 'Pub Style Fish N'' Chips', 350.00, 0.0500, 'non_veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000010'),
	('90000000-0000-4000-8000-000000000081', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003a', 'Pub Fries', 260.00, 0.0500, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000004d'),
	('90000000-0000-4000-8000-000000000082', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003a', 'Smooth Criminal (1.5L pitcher)', 1200.00, 0.1800, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-000000000070'),
	('90000000-0000-4000-8000-000000000083', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003b', 'Arbor Loaded Nachos', 420.00, 0.0500, 'veg', 1, 'placed', null, null, '40000000-0000-4000-8000-000000000009'),
	('90000000-0000-4000-8000-000000000084', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003c', 'Arbor Loaded Nachos', 420.00, 0.0500, 'veg', 2, 'placed', null, null, '40000000-0000-4000-8000-000000000009'),
	('90000000-0000-4000-8000-000000000085', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003d', 'Arbor Loaded Nachos', 420.00, 0.0500, 'veg', 2, 'placed', null, null, '40000000-0000-4000-8000-000000000009'),
	('90000000-0000-4000-8000-000000000086', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003e', 'Arbor Loaded Nachos', 420.00, 0.0500, 'veg', 1, 'placed', null, null, '40000000-0000-4000-8000-000000000009'),
	('90000000-0000-4000-8000-000000000087', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003b', 'Margherita', 480.00, 0.0500, 'veg', 1, 'placed', null, null, '40000000-0000-4000-8000-000000000027'),
	('90000000-0000-4000-8000-000000000088', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003f', 'Chicken Wings', 325.00, 0.0500, 'non_veg', 2, 'placed', null, null, '40000000-0000-4000-8000-000000000052'),
	('90000000-0000-4000-8000-000000000089', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000040', 'Buffalo Chicken Burger', 480.00, 0.0500, 'non_veg', 3, 'placed', null, null, '40000000-0000-4000-8000-000000000056'),
	('90000000-0000-4000-8000-00000000008a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000041', 'BBQ Pork Ribs', 600.00, 0.0500, 'non_veg', 1, 'placed', null, null, '40000000-0000-4000-8000-000000000042'),
	('90000000-0000-4000-8000-00000000008b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003d', 'Old School Chilli Chicken', 380.00, 0.0500, 'non_veg', 2, 'placed', null, null, '40000000-0000-4000-8000-00000000004b'),
	('90000000-0000-4000-8000-00000000008c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000042', 'Old School Chilli Chicken', 380.00, 0.0500, 'non_veg', 1, 'placed', null, null, '40000000-0000-4000-8000-00000000004b'),
	('90000000-0000-4000-8000-00000000008d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000043', 'Chilli Cheese Bacon Fries', 550.00, 0.0500, 'non_veg', 1, 'placed', null, null, '40000000-0000-4000-8000-00000000000a'),
	('90000000-0000-4000-8000-00000000008e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003b', 'Chilli Cheese Bacon Fries', 550.00, 0.0500, 'non_veg', 1, 'placed', null, null, '40000000-0000-4000-8000-00000000000a'),
	('90000000-0000-4000-8000-00000000008f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000042', 'I Like To Party', 550.00, 0.0500, 'non_veg', 2, 'placed', null, null, '40000000-0000-4000-8000-00000000002d'),
	('90000000-0000-4000-8000-000000000090', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000043', 'Pub Style Fish N'' Chips', 350.00, 0.0500, 'non_veg', 3, 'placed', null, null, '40000000-0000-4000-8000-000000000010'),
	('90000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000044', 'The Arbor-ger', 500.00, 0.0500, 'non_veg', 2, 'placed', null, null, '40000000-0000-4000-8000-000000000053'),
	('90000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003d', 'Peri-Peri Paneer', 480.00, 0.0500, 'veg', 3, 'preparing', now() - interval '5 minutes', null, '40000000-0000-4000-8000-000000000028'),
	('90000000-0000-4000-8000-000000000093', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000041', 'Peri-Peri Paneer', 480.00, 0.0500, 'veg', 1, 'preparing', now() - interval '9 minutes', null, '40000000-0000-4000-8000-000000000028'),
	('90000000-0000-4000-8000-000000000094', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000045', 'Chicken Club Pizza', 550.00, 0.0500, 'non_veg', 1, 'preparing', now() - interval '6 minutes', null, '40000000-0000-4000-8000-000000000029'),
	('90000000-0000-4000-8000-000000000095', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000040', 'Chicken Club Pizza', 550.00, 0.0500, 'non_veg', 1, 'preparing', now() - interval '4 minutes', null, '40000000-0000-4000-8000-000000000029'),
	('90000000-0000-4000-8000-000000000096', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003d', 'Sausage Platter', 600.00, 0.0500, 'non_veg', 1, 'preparing', now() - interval '4 minutes', null, '40000000-0000-4000-8000-000000000041'),
	('90000000-0000-4000-8000-000000000097', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000046', 'Sausage Platter', 600.00, 0.0500, 'non_veg', 2, 'preparing', now() - interval '6 minutes', null, '40000000-0000-4000-8000-000000000041'),
	('90000000-0000-4000-8000-000000000098', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003b', 'Sausage Platter', 600.00, 0.0500, 'non_veg', 1, 'preparing', now() - interval '3 minutes', null, '40000000-0000-4000-8000-000000000041'),
	('90000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000040', 'Fiery Chicken Alfredo', 430.00, 0.0500, 'non_veg', 1, 'preparing', now() - interval '5 minutes', null, '40000000-0000-4000-8000-00000000001f'),
	('90000000-0000-4000-8000-00000000009a', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000047', 'Smoked Chicken Quesadilla', 425.00, 0.0500, 'non_veg', 3, 'preparing', now() - interval '5 minutes', null, '40000000-0000-4000-8000-000000000014'),
	('90000000-0000-4000-8000-00000000009b', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000048', 'Smoked Chicken Quesadilla', 425.00, 0.0500, 'non_veg', 1, 'preparing', now() - interval '5 minutes', null, '40000000-0000-4000-8000-000000000014'),
	('90000000-0000-4000-8000-00000000009c', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000041', 'Smoked Chicken Quesadilla', 425.00, 0.0500, 'non_veg', 3, 'preparing', now() - interval '6 minutes', null, '40000000-0000-4000-8000-000000000014'),
	('90000000-0000-4000-8000-00000000009d', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000049', 'Grilled Piri Piri Prawns', 500.00, 0.0500, 'non_veg', 2, 'preparing', now() - interval '4 minutes', null, '40000000-0000-4000-8000-000000000040'),
	('90000000-0000-4000-8000-00000000009e', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000046', 'Grilled Piri Piri Prawns', 500.00, 0.0500, 'non_veg', 2, 'preparing', now() - interval '3 minutes', null, '40000000-0000-4000-8000-000000000040'),
	('90000000-0000-4000-8000-00000000009f', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004a', 'Grilled Piri Piri Prawns', 500.00, 0.0500, 'non_veg', 2, 'preparing', now() - interval '3 minutes', null, '40000000-0000-4000-8000-000000000040'),
	('90000000-0000-4000-8000-0000000000a0', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003f', 'Turkish Lamb Kebab', 460.00, 0.0500, 'non_veg', 1, 'preparing', now() - interval '5 minutes', null, '40000000-0000-4000-8000-000000000044'),
	('90000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000044', 'Turkish Lamb Kebab', 460.00, 0.0500, 'non_veg', 3, 'preparing', now() - interval '3 minutes', null, '40000000-0000-4000-8000-000000000044'),
	('90000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000044', 'Baked Mac & Cheese', 320.00, 0.0500, 'veg', 3, 'preparing', now() - interval '5 minutes', null, '40000000-0000-4000-8000-000000000021'),
	('90000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004b', 'Baked Mac & Cheese', 320.00, 0.0500, 'veg', 2, 'preparing', now() - interval '6 minutes', null, '40000000-0000-4000-8000-000000000021'),
	('90000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003f', 'Beer Battered Onion Rings', 260.00, 0.0500, 'veg', 2, 'ready', now() - interval '13 minutes', now() - interval '2 minutes', '40000000-0000-4000-8000-00000000000f'),
	('90000000-0000-4000-8000-0000000000a5', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000046', 'Beer Battered Onion Rings', 260.00, 0.0500, 'veg', 1, 'ready', now() - interval '17 minutes', now() - interval '3 minutes', '40000000-0000-4000-8000-00000000000f'),
	('90000000-0000-4000-8000-0000000000a6', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003e', 'Sweet Potato Fries', 260.00, 0.0500, 'veg', 1, 'ready', now() - interval '15 minutes', now() - interval '6 minutes', '40000000-0000-4000-8000-00000000000b'),
	('90000000-0000-4000-8000-0000000000a7', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000049', 'Sweet Potato Fries', 260.00, 0.0500, 'veg', 3, 'ready', now() - interval '9 minutes', now() - interval '3 minutes', '40000000-0000-4000-8000-00000000000b'),
	('90000000-0000-4000-8000-0000000000a8', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004a', 'Sweet Potato Fries', 260.00, 0.0500, 'veg', 2, 'ready', now() - interval '18 minutes', now() - interval '4 minutes', '40000000-0000-4000-8000-00000000000b'),
	('90000000-0000-4000-8000-0000000000a9', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003b', 'Caramel Drizzled Brownie', 350.00, 0.0500, 'veg', 1, 'ready', now() - interval '18 minutes', now() - interval '4 minutes', '40000000-0000-4000-8000-000000000032'),
	('90000000-0000-4000-8000-0000000000aa', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003d', 'Caramel Drizzled Brownie', 350.00, 0.0500, 'veg', 3, 'ready', now() - interval '13 minutes', now() - interval '6 minutes', '40000000-0000-4000-8000-000000000032'),
	('90000000-0000-4000-8000-0000000000ab', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003c', 'Spicy Fried Calamari', 370.00, 0.0500, 'non_veg', 1, 'ready', now() - interval '17 minutes', now() - interval '5 minutes', '40000000-0000-4000-8000-000000000013'),
	('90000000-0000-4000-8000-0000000000ac', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004c', 'Spicy Fried Calamari', 370.00, 0.0500, 'non_veg', 1, 'ready', now() - interval '9 minutes', now() - interval '3 minutes', '40000000-0000-4000-8000-000000000013'),
	('90000000-0000-4000-8000-0000000000ad', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000043', 'Tex Mex Fries', 375.00, 0.0500, 'veg', 3, 'ready', now() - interval '15 minutes', now() - interval '7 minutes', '40000000-0000-4000-8000-00000000003e'),
	('90000000-0000-4000-8000-0000000000ae', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000044', 'Cauliflower Wings', 250.00, 0.0500, 'veg', 1, 'ready', now() - interval '12 minutes', now() - interval '3 minutes', '40000000-0000-4000-8000-000000000051'),
	('90000000-0000-4000-8000-0000000000af', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000047', 'Long Lasting Vertigo', 260.00, 0.0500, 'veg', 2, 'ready', now() - interval '16 minutes', now() - interval '7 minutes', '40000000-0000-4000-8000-00000000002f'),
	('90000000-0000-4000-8000-0000000000b0', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000003e', 'Peri-Peri Paneer', 480.00, 0.0500, 'veg', 2, 'preparing', now() - interval '9 minutes', null, '40000000-0000-4000-8000-000000000028'),
	('90000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004d', 'Sausage Platter', 600.00, 0.0500, 'non_veg', 2, 'preparing', now() - interval '12 minutes', null, '40000000-0000-4000-8000-000000000041'),
	('90000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000040', 'Peri-Peri Paneer', 480.00, 0.0500, 'veg', 1, 'preparing', now() - interval '4 minutes', null, '40000000-0000-4000-8000-000000000028'),
	('90000000-0000-4000-8000-0000000000b3', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004d', 'Bangalore Bliss (500ml)', 320.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000005d'),
	('90000000-0000-4000-8000-0000000000b4', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004d', 'Beachshack (500ml)', 320.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-000000000060'),
	('90000000-0000-4000-8000-0000000000b5', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004d', 'Fresh Lime Soda', 120.00, 0.1800, 'veg', 1, 'served', null, null, '40000000-0000-4000-8000-00000000009d'),
	('90000000-0000-4000-8000-0000000000b6', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004e', 'Beer Battered Onion Rings', 260.00, 0.0500, 'veg', 2, 'served', null, null, '40000000-0000-4000-8000-00000000000f'),
	('90000000-0000-4000-8000-0000000000b7', '10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-00000000004e', 'Turkish Lamb Kebab', 460.00, 0.0500, 'non_veg', 1, 'preparing', now() - interval '6 minutes', null, '40000000-0000-4000-8000-000000000044')
on conflict (id) do nothing;

-- 5 bills — 2 requested on active sessions
-- (every other active session stays 'open' with no bills row at all, same
-- as the real app never inserting one until Request Bill; amounts derived
-- on read per docs/core-data-model.md, so left null here), 3 settled on the
-- historical closed sessions with amounts computed from their order items
-- using a simple subtotal+tax formula — a fixture convenience, NOT the
-- official tax/rounding formula (still TBD, see AGENTS.md).
insert into bills (id, restaurant_id, session_id, status, subtotal, tax_amount, total, settled_at, settled_by) values
	('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000007', 'requested', null, null, null, null, null),
	('a0000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000009', 'requested', null, null, null, null, null),
	('a0000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000019', 'settled', 4750.00, 416.90, 5166.90, now() - interval '216 minutes', '20000000-0000-4000-8000-000000000007'),
	('a0000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001a', 'settled', 9510.00, 1366.00, 10876.00, now() - interval '276 minutes', '20000000-0000-4000-8000-000000000007'),
	('a0000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-00000000001b', 'settled', 4610.00, 542.50, 5152.50, now() - interval '298 minutes', '20000000-0000-4000-8000-000000000007')
on conflict (id) do nothing;

-- Backfill orders.bill_id to match what request_bill() would set for each of
-- these seeded sessions' bill (Full-Service only ever draws one per session
-- in both fixtures above) — a trailing update rather than hand-editing the
-- generated insert blocks, since both fixtures are regenerated by script.
update orders o
set bill_id = b.id
from bills b
where b.session_id = o.session_id and o.bill_id is null;
