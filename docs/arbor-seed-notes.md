# Arbor Brewing Company — seed fixture notes

Second tenant in `supabase/seed.sql`, alongside the original "Dineinly Test
Kitchen" fixture (kept as-is, untouched — this is a multi-tenant addition,
not a replacement). Loads automatically on `supabase db reset`.

Use this doc when a test against Arbor data behaves unexpectedly: check
what was actually seeded and why, before assuming it's a bug.

- **Restaurant id:** `10000000-0000-4000-8000-000000000002`
- **Generator:** `supabase/gen-arbor-seed.py` (stdlib Python, deterministic
  fixed-seed RNG) — edit it and rerun rather than hand-editing the SQL block
  in `seed.sql`; see the script's docstring for the regenerate command.
- **Menu source:** `supabase/menu-1.md`, `supabase/menu-2.md`, `supabase/menu-3.md`.

## Menu — 253 items, 19 categories

One category per menu-file section, in source order, Food sections at 5%
tax and Beverage sections at 18% (matching the existing restaurant's split):

| Category | Tax | Items |
|---|---|---|
| Favourites | 5% | 17 |
| Bar Snacks | 5% | 3 |
| Large Plates | 5% | 10 |
| Pizzas | 5% | 8 |
| Desserts | 5% | 5 |
| Salads | 5% | 4 |
| Tacos | 5% | 5 |
| Small Plates | 5% | 20 |
| Wings | 5% | 2 |
| Burgers | 5% | 4 |
| Beers on Tap | 18% | 26 |
| Beer Cans | 18% | 2 |
| Classic Cocktails | 18% | 7 |
| Sangria & Wine | 18% | 23 |
| Sparkling Wine & Champagne | 18% | 3 |
| Mocktails & Kombucha | 18% | 14 |
| Spirits & Liquors | 18% | 58 |
| Whisky & Bourbon | 18% | 16 |
| Non-Alcoholic Beverages | 18% | 26 |

Labels vocabulary (`menu_labels`): `chef special`, `spicy`, `bestseller`,
`new`. Per `docs/product.md` ("Label (at most one, picked from the
restaurant's own label list)"), every item carries **0 or 1** label, never
more — 43 items carry one (20 spicy, 14 bestseller, 6 chef special, 3 new),
the other 210 carry none. Dietary claims (vegan/gluten free/eggless) are
**not** in this vocabulary — a label here is a curated promo tag (Chef
Recommended, Seasonal), not a dietary certification, and a dish can be both
vegan and a bestseller at once, which a single-slot label can't hold anyway.
Those markers live in description text only (already present as `(Gluten
Free)` / `(Eggless)` etc.).

**Modeling limits — not bugs, the schema has no add-on/variant table**
(`docs/core-data-model.md` — `menu_items` has a single `price` column):

- Multi-size beers (330ml/500ml/1.5L pitcher) and glass/bottle wines each
  became a **separate menu item row** per size, e.g. `Bangalore Bliss
  (330ml)` / `(500ml)` / `(1.5L pitcher)`.
- Dish add-ons (e.g. Nachos + grilled chicken +100) are folded into the
  **description text only** — not a selectable, priced modifier.
- Wings' 4 sauce choices are listed in the description as guidance text,
  same reason.
- The menu's `[Vegan]` tag maps to `diet = 'veg'` (the schema's `diet` enum
  is `veg`/`non_veg` only) — no separate vegan badge, per the labels note
  above.

**Deliberate edge cases:**

- **Grilled Salmon** — `availability = 'sold_out'`.
- **Old Monk** — `availability = 'sold_out'` (a spirit, not just food).
- **Banoffee Pie** — `status = 'archived'` (discontinued).

## Floor — 30 tables, rush hour

| Group | Tables | Notes |
|---|---|---|
| Free (no session) | T26–T30 | 5 empty tables |
| Single-seated | T1–T19, T24, T25 | 21 tables, 1 session each |
| Merged | T20, T21, T22, T23 | 1 shared session — T21–23 (free) were merged into T20's existing session, per the MVP "merge only absorbs a free table" rule (`docs/product.md`) |

25 physical tables occupied → 22 distinct active `table_sessions` (merge
collapses 4 tables into 1). Plus **3 historical closed sessions**, already
settled, not tied to any current table (turned over earlier today) — for
exercising the settled-bill / closed-session read paths.

**T15 — "same QR in multiple spots" scenario:** a long communal table.
`qr_token` is 1:1 per `restaurant_table` by design (`docs/architecture.md` §
Route Structure), so "the same QR at multiple seats" isn't a second DB row —
it's one physical table whose token is printed on 3 placards along its
length; every scan resolves to the same table/session, which is expected
behavior, not a bug. Modeled here by giving T15 unusually heavy multi-guest
activity instead: 6 rounds, every order `placed_by_type = 'guest'` (no
staff-assisted orders), simulating several phones ordering into one cart.

## Staff — 14 rows

Same individual Email-OTP-per-person pattern as the existing fixture.
`docs/architecture.md`'s shared kitchen/waiter "station account" (one
`auth.users` identity per role, PIN-based attribution) is an agreed design,
**not yet built** — so this mirrors what actually ships today, not the
future pairing-code flow.

| Role | Status | Count | Emails |
|---|---|---|---|
| Owner | active | 1 | `owner@arborbrewing.test` (Suresh Kumar, `is_primary_owner`) |
| Manager | active | 2 | `manager1@arborbrewing.test`, `manager2@arborbrewing.test` |
| Waiter | active | 6 | `waiter1..6@arborbrewing.test` |
| Kitchen | active | 3 | `kitchen1..3@arborbrewing.test` |
| Waiter | **invited** | 1 | `waiter7@arborbrewing.test` (Ritika Shah — never signed in, no `user_id`) |
| Waiter | **removed** | 1 | `waiter-alumni@arborbrewing.test` (Vinay Chandran — had an account, offboarded) |

`pin_hash` is `null` on every row, same reasoning as the existing fixture's
comment: the PIN-writing flow lands separately, and a fake hash here would
bake in a hashing scheme this file has no business choosing.

## Orders — rush-hour kitchen queue

Every active session carries 1–6 completed ("served") rounds (merge group
and T15 forced to 6, the busiest tables). On top of that, a live **current
round** feeds the kitchen display's batch queue
(`apps/web/lib/kitchen-batches.ts` groups unserved `order_items` by dish
name within each status column):

- **10 distinct dishes** at `placed`
- **8 distinct dishes** at `preparing` (2 with `preparing_at` > 8 minutes
  ago, so they hit the display's overdue flag)
- **7 distinct dishes** at `ready`

Each dish batch is fed by 1–4 *different* tables/orders, so several batches
show multiple tables ordering the same dish at once — real rush-hour firing,
not one order per dish. Verify after a reset:

```sql
select status, count(distinct item_name), count(*)
from order_items
where restaurant_id = '10000000-0000-4000-8000-000000000002'
  and status in ('placed','preparing','ready')
group by status;
-- placed | 10 | ~15   preparing | 8 | ~21   ready | 7 | ~12
```

**Other order-level edge cases:**

- **T1** — snapshot-immutability check: a served historical order still
  references **Banoffee Pie** (now `archived`) and **Grilled Salmon** (now
  `sold_out`) at their original price/name — proves `order_items` snapshots
  survive later menu edits.
- **T2** — one `order_item.status = 'cancelled'` (Chicken Club Pizza)
  alongside a served Coke in the same order.
- **T25** — a drinks-only served round (2 beers + a Fresh Lime Soda) with no
  unserved items — proves the kitchen display shows nothing for a round
  that never touched the kitchen.
- **Cart items** (uncommitted, pre-confirm): 2 guest lines on T15, 1 guest
  line elsewhere, and 1 **staff-added** line (Nikhil Pillai ordering for a
  guest) — the `added_by_type = 'staff'` path the original fixture didn't
  cover.

## Bills

22 bills on the active sessions, `status` derived-on-read so amounts stay
`null` (matches the existing fixture's `open` bill) except two deliberate
`requested` cases:

- **T5** — bill `requested`, kitchen fully caught up (no live items) — the
  clean "ready to settle" case.
- **T7** — bill `requested` while a Peri-Peri Paneer is still `preparing` —
  guest asked for the bill before the kitchen finished; exercises whatever
  the settle flow does when it isn't actually ready.

3 `settled` bills on the historical closed sessions, with `subtotal` /
`tax_amount` / `total` computed from their served order items using a
**simple fixture formula** (subtotal + per-line tax by category rate,
rounded to 2dp). This is **not** the official tax/rounding formula
(`docs/core-data-model.md`, implemented in `apps/web/lib/bill-math.ts`) —
it's only here so the settled rows are internally consistent, not a claim
about the real rounding rule.

## Explicitly not seeded

**Force-terminated ("walkout") session** — `close_session()`'s void-vs-settle
handling of an open bill on force-terminate is implemented (`docs/core-data-model.md`
§ Lifecycle invariants: an open/requested Bill is deleted (voided), an
already-settled one is left untouched). No walkout scenario is seeded here
simply because it hasn't been prioritized, not because the behavior is
undecided.

## Regenerating

```bash
cd supabase
python3 gen-arbor-seed.py          # writes arbor_seed_block.sql
```

Then replace the `-- Arbor Brewing Company` block at the end of `seed.sql`
with the new output, and `supabase db reset` to reload. The script is
seeded (`random.seed(4200)`) so a rerun with no data changes produces byte-
identical output — diffs only show real content changes.
