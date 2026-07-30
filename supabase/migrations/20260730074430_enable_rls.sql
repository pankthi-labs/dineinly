-- Custom SQL migration file, put your code below! --

-- Enable RLS on every tenant-facing table, deny-all (no policies yet).
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
