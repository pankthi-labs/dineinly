-- Local dev fixture data. Runs automatically after migrations on every
-- `supabase db reset` (see supabase/config.toml [db.seed]).
--
-- Fixed UUIDs so ids are stable across resets and can be hardcoded in tests
-- and dev links. Scheme: first hex group encodes the table, last segment is
-- a running counter — e.g. all staff rows are 20000000-...-0000000000NN.
--
-- Tax rate (5% / 18%) and service_charge_rate (5%) below are placeholder
-- values for dev fixtures only — they do NOT resolve the tax/service/
-- rounding formula marked TBD in docs/core-data-model.md.
--
-- pin_hash is left null on every staff row: no PIN flow exists yet, and
-- seeding a fake hash would bake in a hashing choice nobody has made.
--
-- Runs as the postgres superuser, which bypasses RLS.

-- 1 restaurant -----------------------------------------------------------
insert into restaurants (id, name, address, gst_number, state, pincode, service_charge_rate, status)
values (
	'10000000-0000-0000-0000-000000000001',
	'Dineinly Test Kitchen',
	'12 MG Road, Indiranagar',
	'29ABCDE1234F1Z5',
	'Karnataka',
	'560038',
	0.0500,
	'active'
)
on conflict (id) do nothing;

-- 4 staff — owner, manager, waiter, kitchen, all active ------------------
insert into staff (id, restaurant_id, email, role, status) values
	('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner@dineinly.test', 'owner', 'active'),
	('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'manager@dineinly.test', 'manager', 'active'),
	('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'waiter@dineinly.test', 'waiter', 'active'),
	('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'kitchen@dineinly.test', 'kitchen', 'active')
on conflict (id) do nothing;

-- 2 menu categories — Food (5% tax), Beverages (18% tax) -----------------
insert into menu_categories (id, restaurant_id, name, sort, tax_rate, status) values
	('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Food', 0, 0.0500, 'active'),
	('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Beverages', 1, 0.1800, 'active')
on conflict (id) do nothing;

-- 8 menu items — mixed diet, one sold_out, one archived, some with -------
-- spice/salt/ice set and some left null
insert into menu_items (
	id, restaurant_id, category_id, name, description, price, prep_time,
	serving_size, diet, availability, labels, spice, salt, ice, status
) values
	('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
		'Paneer Butter Masala', 'Cottage cheese in a creamy tomato gravy.', 320.00, 20, '1 bowl (serves 2)',
		'veg', 'available', array['chef special'], 'regular', null, null, 'active'),
	('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
		'Butter Chicken', 'Slow-cooked chicken in a rich buttery tomato gravy.', 380.00, 25, '1 bowl (serves 2)',
		'non_veg', 'available', array[]::text[], 'mild', null, null, 'active'),
	('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
		'Veg Biryani', 'Layered basmati rice with mixed vegetables and spices.', 260.00, 30, '1 plate',
		'veg', 'sold_out', array[]::text[], 'extra spicy', null, null, 'active'),
	('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
		'Chicken 65', 'Deep-fried spiced chicken bites.', 300.00, 15, '1 plate (12 pcs)',
		'non_veg', 'available', array['spicy'], null, null, null, 'active'),
	('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
		'Dal Fry (old recipe)', 'Discontinued — replaced by the new dal tadka.', 180.00, 15, '1 bowl',
		'veg', 'available', array[]::text[], null, null, null, 'archived'),
	('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
		'Masala Chai', 'Spiced Indian tea with milk.', 60.00, 5, '1 cup',
		'veg', 'available', array[]::text[], null, null, null, 'active'),
	('40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
		'Lemon Soda', 'Fresh lime soda, sweet or salted.', 90.00, 5, '1 glass',
		'veg', 'available', array[]::text[], null, 'less salt', 'regular', 'active'),
	('40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002',
		'Cold Coffee', 'Blended iced coffee with milk.', 140.00, 8, '1 glass',
		'veg', 'available', array['bestseller'], null, null, 'less', 'active')
on conflict (id) do nothing;

-- 2 table sessions — one active, one closed -------------------------------
insert into table_sessions (id, restaurant_id, status, opened_at, closed_at) values
	('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active', now() - interval '30 minutes', null),
	('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'closed', now() - interval '2 days', now() - interval '2 days' + interval '1 hour')
on conflict (id) do nothing;

-- 4 restaurant tables — T1/T2 seated, T3/T4 free --------------------------
insert into restaurant_tables (id, restaurant_id, label, qr_token, session_id) values
	('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'T1', 'seed-qr-table-1', '50000000-0000-0000-0000-000000000001'),
	('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'T2', 'seed-qr-table-2', '50000000-0000-0000-0000-000000000002'),
	('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'T3', 'seed-qr-table-3', null),
	('60000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'T4', 'seed-qr-table-4', null)
on conflict (id) do nothing;

-- 2 cart items in the active session, added by a guest --------------------
insert into cart_items (id, restaurant_id, session_id, menu_item_id, quantity, spice, salt, ice, added_by_type, added_by_staff_id) values
	('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 2, 'regular', null, null, 'guest', null),
	('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000007', 1, null, 'less salt', 'regular', 'guest', null)
on conflict (id) do nothing;

-- 2 orders — one placed by staff (closed session), one by a guest --------
-- (active session). Distinct idempotency_key on each.
insert into orders (id, restaurant_id, session_id, placed_at, placed_by_type, placed_by_staff_id, idempotency_key) values
	('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', now() - interval '2 days' + interval '10 minutes', 'staff', '20000000-0000-0000-0000-000000000003', 'seed-order-1'),
	('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', now() - interval '20 minutes', 'guest', null, 'seed-order-2')
on conflict (id) do nothing;

-- 5 order items — snapshotted name/price/tax/diet, statuses spanning ------
-- placed, preparing, ready, served
insert into order_items (id, restaurant_id, order_id, item_name, unit_price, tax_rate, diet, quantity, status, menu_item_id) values
	('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Butter Chicken', 380.00, 0.0500, 'non_veg', 1, 'served', '40000000-0000-0000-0000-000000000002'),
	('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Masala Chai', 60.00, 0.1800, 'veg', 2, 'served', '40000000-0000-0000-0000-000000000006'),
	('90000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'Chicken 65', 300.00, 0.0500, 'non_veg', 1, 'placed', '40000000-0000-0000-0000-000000000004'),
	('90000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'Veg Biryani', 260.00, 0.0500, 'veg', 1, 'preparing', '40000000-0000-0000-0000-000000000003'),
	('90000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'Cold Coffee', 140.00, 0.1800, 'veg', 1, 'ready', '40000000-0000-0000-0000-000000000008')
on conflict (id) do nothing;

-- 2 bills — open on the active session, settled on the closed one --------
insert into bills (
	id, restaurant_id, session_id, status, service_charge_rate,
	subtotal, tax_amount, service_charge_amount, total, settled_at, settled_by
) values
	('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
		'open', null, null, null, null, null, null, null),
	('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
		'settled', 0.0500, 500.00, 40.60, 25.00, 565.60,
		now() - interval '2 days' + interval '1 hour', '20000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;
