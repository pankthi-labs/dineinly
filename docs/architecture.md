# Architecture

Architectural principles for Dineinly. Technology choices are in `tech-stack.md`.

## Core Principles

- **Modular monolith** — one repo, multiple packages, shared types/components. No microservices.
- **Multi-tenant first** — every restaurant is an isolated tenant. No cross-tenant data leakage; tenant isolation at every layer.
- **Real-time first** — state changes propagate immediately. No polling, no manual refreshes.
- **Server-first** — business logic on the server; clients display state and never own business rules.
- **Single source of truth** — PostgreSQL. Never duplicate business state.
- **Security by default** — enforced on every endpoint, table, and action.

## System Layers

`Guest → Frontend → tRPC → Business logic → PostgreSQL → Realtime → Clients`

FastAPI/Python is post-MVP (see `tech-stack.md`). When introduced it must preserve identical tenant-isolation guarantees, documented first.

## Data

- Every entity belongs to exactly one restaurant; every query is tenant-scoped; every mutation validated.
- Server state lives on the server; client state is UI-only. Never trust client input.
- Soft-delete where recovery matters. Schema changes only via migrations — never bypass them.
- Drizzle schema (`packages/db/schema`) is the DB source of truth.
- **Migration ownership is split and must stay split: Drizzle authors, Supabase CLI applies.** `drizzle-kit generate` diffs the Drizzle schema and writes timestamped SQL into `supabase/migrations/` — one folder, one history. The Supabase CLI (`db reset` locally, `db push` against a linked remote) is the only thing that ever applies that SQL. This exists because the project also needs hand-written SQL — RLS policies, `realtime.messages` policies, broadcast triggers (`docs/realtime.md`) — applied in the same order as the table DDL, and because `supabase db reset` runs `supabase/seed.sql` immediately after migrations; a second, Drizzle-applied migration history would leave that reset with no tables to seed. Never run `drizzle-kit migrate`, `drizzle-kit push`, or `supabase db diff` — each starts a second, divergent history in `__drizzle_migrations` or bypasses the committed migrations entirely. Never hand-edit tables in Studio.
- **External Supabase schemas (`auth`, `storage`, `realtime`, ...) are never Drizzle-managed tables.** A typed `.references()` stub for e.g. `auth.users` makes `drizzle-kit generate` treat that table as ours to own — it diffs the TS schema graph, not the live DB, so it will emit `CREATE SCHEMA auth; CREATE TABLE auth.users` for a table that already exists, or a `DROP TABLE ... CASCADE` for it on a later regenerate where the stub was removed. Both collide with or destroy infrastructure Supabase owns. Instead: declare the column as a plain, untyped `uuid(...)` in the Drizzle schema, and add the actual FK via hand-written SQL — `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (...) REFERENCES <schema>.<table>(...)` — in a custom migration (`drizzle-kit generate --custom`), never folded into a Drizzle-generated schema migration.

## Authentication

Role-specific. Owners, Managers, and Guests are passwordless; station accounts (below) are the one exception, since a shared device has no inbox to receive an OTP.

- **Owners & Managers:** Supabase Email OTP only (no magic links).
- **Kitchen displays & shared floor tablets:** per-restaurant station account with a persistent Supabase session — the auth/DB boundary, representing the trusted device. On floor tablets, individual staff identify via an application-level PIN used only for attribution/RBAC/audit/UI — it is not a Supabase auth factor and grants no DB access. Provisioning is device pairing, not a shared password — see "Station Account Provisioning" below.
- **Guests:** short-lived scoped token (see below); never create accounts.

Restaurant identity is always server-derived. No NFC badges, no WebAuthn/passkeys — station account + PIN only.

### Station Account Provisioning

A station account is a `Staff` row with `role = kitchen` or `role = waiter`, backed by one Supabase Auth identity (`auth.users` row) per restaurant per role. That identity is not a real person's inbox: its email is a synthetic, unroutable address (`kitchen-<restaurant_id>@stations.dineinly.internal`, `waiter-<restaurant_id>@stations.dineinly.internal`) that exists only to satisfy Supabase Auth's unique-email requirement. Nothing is ever sent to it.

Every kitchen display in a restaurant shares the same `kitchen` identity; every floor tablet shares the same `waiter` identity. What's per-device is the pairing, not the identity:

1. **Pairing code.** An Owner or Manager, from Staff Roster settings, generates a one-time pairing code (8 digits from a CSPRNG, ~10-minute TTL) scoped to their restaurant and a station type (kitchen or waiter). The server mints this code; it is never derived from or equal to any password.
2. **Device entry.** On first boot, the kitchen display or floor tablet shows an "Enter pairing code" screen. The Manager types the code into the device (or the device scans a QR encoding it). No password is ever typed on the device.
3. **Session issuance.** The server validates the code, exchanges it for a session on that restaurant's station identity, and issues the device its own long-lived refresh token — kiosk-style, no re-login expected. The pairing code is single-use and burns immediately on redemption or at TTL expiry, whichever comes first.
4. **Per-device revocation.** Each physical device gets its own device record and refresh token, even though all devices for a station type share the same underlying `auth.users` identity. A lost or stolen tablet is revoked individually from Staff Roster settings — this invalidates only that device's session, not the station identity itself, so every other kitchen display or floor tablet keeps working unaffected.
5. **Attribution stays separate.** Once a device is paired, individual staff identify via PIN (`Staff.pin_hash`) as already described above — attribution/audit/UI only, no DB auth power, no relationship to pairing.

Built for the `waiter` station type: pairing-code issuance/redemption, per-device records, and revocation live in `supabase/migrations/20260820070301_thick_blazing_skull.sql` (the RPCs and their RLS) and `apps/web/server/routers/station.ts` (the router), with the Owner/Manager UI in `apps/web/app/restaurants/[restaurantId]/staff/station-panel.tsx` and the device-facing screen at `apps/web/app/station/pair/`. The code is the source of truth for the details. The `kitchen` station type reuses the same machinery but has no UI wired to it yet.

- **Invited staff can sign in.** Dineinly Admin's Restaurants Directory creates a restaurant's owner as a Staff row (`role = owner, status = invited, user_id = null`); `/sign-in` (`apps/web/app/sign-in/page.tsx`) then gets them from that invitation to a live session in two steps, both backed by `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 10 and wrapped by `server/routers/auth.ts`:
  1. Before calling `signInWithOtp`, the client calls `auth.resolveSignIn`, which runs `resolve_staff_signin(email)` — a `SECURITY DEFINER` function (the caller has no session yet, so no other way to read `auth.users`) that returns a single boolean: `shouldCreateUser: true` only when the email matches an `invited` Staff row with no `auth.users` row yet. It never distinguishes "existing account" from "unknown email" in its response — doing so would let an unauthenticated caller enumerate registered emails — so the client always proceeds to `signInWithOtp` with this flag; for a genuinely unknown email, GoTrue itself rejects the sign-in since it won't create a user with `shouldCreateUser: false`. Unconditional `shouldCreateUser: true` would make sign-in open self-registration; this pre-check is what keeps it invite-only.
  2. Right after `verifyOtp()` succeeds, the client calls `auth.linkStaffAccount`, which runs `link_staff_account()` — also `SECURITY DEFINER`, since Staff has no self-service RLS policy yet (see the "Every staff-side policy" note below) — to set `user_id = auth.uid()` and flip `status: invited → active` on every Staff row matching the caller's own verified email (one person can be invited at more than one restaurant), then copies the linked name into `user_metadata.display_name` via `supabase.auth.updateUser()` (the display name `getViewer()` already reads).

  Still open: Staff has no RLS policies of its own (only `admin_all_staff`), and `requireRestaurantAccess` still only admits Dineinly Admin — see the Route Structure section below. Both land with the staff-side page-access flow, a separate task.

- **Dineinly Admin:** a platform-level Supabase Auth identity, not a Staff row (see `core-data-model.md`), carrying its privileged claim in `app_metadata.app_role = "dineinly_admin"`. Supabase embeds `app_metadata` in every JWT it issues, so no `custom_access_token` hook is needed; `app_metadata` is writable only by the service role, so a signed-in user can never self-promote. This is the asymmetric counterpart to guest tokens — guests carry a top-level `app_role` claim because we mint those tokens ourselves, but GoTrue-issued admin tokens only expose custom claims via `app_metadata`. `apps/web/lib/auth.ts` (`getViewer`/`requireAdmin`) is the one place the claim string is read app-side; RLS checks the same claim independently via `public.is_dineinly_admin()` (`supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 4), which grants full read/write on every tenant table, matching the RBAC matrix in `product.md`. Signs in via the same Email OTP flow as Owners/Managers, at `/sign-in`.
  The *first* admin's provisioning is local-dev only: `supabase/seed.sql` seeds `admin@dineinly.com` with the claim on every `db:reset`. Production provisioning of that first identity is unresolved — flag and ask before deploying. Every admin after the first is invited by an existing one, from Dineinly Staff (`/admin/staff`) — `server/routers/admin-staff.ts`, `adminProcedure`-gated. Admin has no table (see `core-data-model.md`), so this router is the one place in the app that uses the Supabase Auth Admin API (`lib/supabase/admin.ts`'s service-role client, which bypasses RLS entirely — the `adminProcedure` check inside each procedure body is the real authorization, not RLS): `invite` calls `auth.admin.createUser()` with the claim baked in at creation (`email_confirm: true`, no email sent — the new admin just signs in via the existing OTP flow, no separate accept-invite step needed since there's no Staff row to link on first sign-in); `update` changes `user_metadata.display_name` only, nothing else is editable; `remove` clears `app_metadata.app_role`, revoking access immediately without deleting the identity — reversible by inviting the same email again. Removing the caller's own row or the last remaining admin is rejected server-side.
  Audit logging for admin actions (`product.md`: "every action audited") is deferred until `audit_logs` ships (`core-data-model.md`) — not yet built.

## Guest Sessions & Anonymous Realtime

1. Guest scans QR → server validates and resolves it to a restaurant table → finds/creates the active table session → issues a signed token with only that session's claims (`restaurant_id`, `table_session_id`, `app_role: "guest"`, expiry).
2. Guest talks to Supabase directly; RLS authorizes every query and Realtime subscription from that token.

Rules:
- Guests never get service-role credentials and never bypass RLS. Token scope is exactly one active table session.
- Guest tokens are **server-minted asymmetric-signed JWTs** (Supabase-trusted signing key, RS256, `jose`) carrying only the session claims — no per-guest anonymous auth user is created. Supabase validates the signature; RLS + Realtime authorize from the claims. Never hand-roll or symmetric-sign tokens. See `apps/web/lib/guest-token.ts`.
- Tokens are long-lived (≥12h, longer for events) so a meal never expires; silent refresh gated on the session being active.
- Revocation is not via expiry: RLS policies check live session state (`status = active`), so closing a session denies access immediately.
- Abuse control: staff can see/remove participants; token issuance is rate-limited per QR.

**Claim contract** — two mechanics PostgREST requires that are easy to get wrong:
- Top-level `role` claim is not an app concept — PostgREST reads it to literally `SET LOCAL ROLE <value>` in Postgres, so it must name a real, pre-granted Postgres role. Guest tokens therefore carry `role: "authenticated"` like any other authenticated session; our own `app_role: "guest"` claim is what RLS policies branch on to tell a guest session apart from a future staff one.
- The JWT header must carry `kid`, matching the signing key registered at `supabase/config.toml`'s `signing_keys_path` (gitignored `supabase/signing_keys.json`, generated via `supabase gen signing-key --algorithm RS256`) — without it PostgREST can't select a key out of the JWKS and rejects the token. The same private key, as JSON, is `GUEST_JWT_SIGNING_KEY` in `.env`.

## Route Structure

Four route trees under `apps/web/app/`, one per identity type above, plus one resolve-only route and one device-onboarding route. **Before adding any page, place it in the tree matching who views it — don't invent a fifth tree, and don't write a new auth check inline in a page.** All gating logic lives in `apps/web/lib/auth.ts`; check there before writing a new one.

`app/station/` is the sanctioned exception, and the only one: it authenticates a *device*, not a viewer, so it belongs to none of the four identity trees — an unpaired tablet has no session at all, and `restaurants/[restaurantId]/layout.tsx` would redirect it away before it could reach a pairing form. It holds the unauthenticated pairing screen and the PIN-unlock cookie endpoint, nothing viewer-facing. See `docs/superpowers/specs/2026-08-20-waiter-station-pin-login-design.md`.

| Tree | Who | Gate | Credential |
|---|---|---|---|
| `app/admin/...` | Dineinly Admin only | `requireAdmin()`, in `admin/layout.tsx` | Supabase Auth cookie |
| `app/restaurants/[restaurantId]/...` | that restaurant's staff + Dineinly Admin viewing it | `requireRestaurantAccess(restaurantId)`, in `restaurants/[restaurantId]/layout.tsx` | Supabase Auth cookie |
| `app/guest/...` | anonymous guest | none — RLS is the only gate | `dineinly_guest_token` cookie (self-signed JWT, see above) |
| `app/qr/[qrToken]` | resolve step, not a page tree | validates `qr_token`, mints the guest JWT, sets the cookie, redirects into `app/guest/menu` | — |

`app/qr/[qrToken]` resolves two kinds of token, branching on which table it matches: a `Restaurant Table.qr_token` resolves to that table's existing active session or creates one (dine-in, unchanged); a `Restaurant.counter_qr_token` always creates a brand-new, tableless Table Session (counter-experience, `core-data-model.md` § Experience Gating) — never looks up an existing one, since a single counter QR serves many concurrent guests. Same route, same guest-JWT minting, no new tree.

`app/qr/[qrToken]` stays flat, not nested under `app/restaurants/[restaurantId]/qr/[qrToken]`: `restaurant_tables.qr_token` is globally unique (`packages/db/src/schema/restaurant-table.ts`, plain `.unique()`, not composite with `restaurant_id`), so it alone resolves to one table and its restaurant — a `restaurantId` segment would be redundant, not information. Nesting it there would also break guest onboarding outright: everything under `restaurants/[restaurantId]/` runs `requireRestaurantAccess` via that tree's layout, which a child route cannot opt out of, so every anonymous guest scanning a QR would be redirected to `/sign-in` before their cookie is ever minted.

`qr_token` is rotatable: Owner/Manager regenerates it from the Table Matrix (RBAC: "Manage Tables & QR Codes" in `product.md`), which overwrites the column in place — no history, no old-token grace period. The old value stops resolving at this route immediately. Rotation never touches `session_id`, so a table's active session (and everyone already seated at it) is unaffected; only a *new* scan of the stale printed QR fails to resolve.

### Table QR Generation

`qr_token` is `text().notNull().unique()` (`packages/db/src/schema/restaurant-table.ts`) — a table can never exist without one, so "Generate QR" on the Table Matrix is a view/download/regenerate action, never a create-from-scratch one. Token value is `crypto.randomUUID()`, minted server-side at table insert and again on regenerate.

Table procedures live in `apps/web/server/routers/tables.ts`, gated by `authedProcedure` at the tRPC layer — the real Owner/Manager/Admin-only enforcement is `staff_write_restaurant_tables` RLS (`supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 5; `staff_select_restaurant_tables` keeps read reach open to any active staff, e.g. Kitchen Display's table chips). `tables/layout.tsx` gates the page itself the same way `staff/layout.tsx` gates Staff Roster. Same split for Menu Desk's writes (`staff_write_menu_categories`/`staff_write_menu_items`/`staff_write_menu_labels`).

1. **`create({ restaurantId, label })`** — mutation. Mints `qr_token` via `crypto.randomUUID()`.
2. **`update({ id, label })`** — mutation. Label only; `qr_token` and `status` change through their own procedures.
3. **`setStatus({ id, status })`** — mutation. Soft-delete/restore (Table Matrix "Hide"/"Show").
4. **`regenerateQr({ tableId })`** — mutation. Rotates `qr_token` in place, returns the updated row. See rotation behavior above.
5. **`downloadQrPdf({ tableId })`** — query. Returns a single-page PDF: QR code + table label.
6. **`downloadAllQrPdf({ restaurantId })`** — query. Returns one multi-page PDF, one page per active table in the restaurant.

`update`, `setStatus({ status: "archived" })`, and `regenerateQr` share one guard: none apply to an occupied table. `updateFreeTable` (`tables.ts`) runs the write with `.eq("id", id).is("session_id", null)` — the occupancy check is part of the `where` clause, atomic with the write, not a separate read-then-write — and returns `BAD_REQUEST` when no row matches. `setStatus({ status: "active" })` (un-hiding) skips the guard: an occupied table can never be archived in the first place, so it can't need un-hiding either. This is server-enforced, not just the card hiding the buttons (below) — client-side hiding is UX only.

Rendering is split by purpose, not duplicated by accident: the enlarged QR shown in the "Show QR" modal renders client-side straight from `qr_token` (canvas-based, `qrcode.react`) — no round-trip, since the list query the matrix already needs returns `qr_token` and RLS already scopes that query to the caller's tenant, so nothing new is exposed. Anything that leaves the app as a printable artifact (both PDF procedures) renders fully server-side instead, via the shared page-builder in `apps/web/lib/qr-pdf.ts` (bulk loops it once per table) — this keeps print output consistent regardless of the admin's browser and keeps "tRPC is the only data layer" intact, since the client never fabricates a QR for anything meant for print. It composes a QR raster (`qrcode` npm package, PNG) into a PDF (`pdf-lib`) rather than embedding SVG — `pdf-lib` has no native SVG support, and a PNG rendered at 512px is print-crisp at table-tent size. Both packages, plus `pdf-lib`'s font/PDF machinery, are imported only from server code (`apps/web/lib/qr-pdf.ts`) — the client-side QR modal imports the token-to-URL helper from the separate `apps/web/lib/qr-url.ts` instead, so none of that weight reaches the browser bundle.

Table Matrix card behavior: each table is a compact tile (grid, not a full-width row — a table carries far less detail than a menu item or restaurant, so a row would waste space), showing only its label and Free/Occupied/Hidden state. No inline QR thumbnail per card — that would mean rendering and laying out a QR canvas on every tile just to be glanced past, when only "Show QR" is ever acted on. Free and hidden tables get four text actions on the tile, per §11's "quick actions inside rows/cards" tier (no icons — an icon per action clutters a row this packed without adding clarity): "Show QR" (opens the enlarged-QR modal, which itself carries "Copy Link" and "Download PDF" — the tile doesn't duplicate the PDF action), "Edit", "Regenerate" (confirm dialog first — warns the old printed QR stops working immediately on confirm), and "Hide"/"Show". An occupied table shows only "Show QR" — Edit/Regenerate/Hide are not rendered at all, not merely disabled, since none of them apply mid-session and the server rejects them anyway. Page header carries one "Download All QR Codes" action for the whole restaurant. Cards sort free-first, then occupied, then hidden (label breaks ties within each group) — free tables are the actionable ones (where can I seat guests right now), occupied need no action, hidden are out of service; a status filter (All/Free/Occupied/Hidden) sits above the grid for restaurants with enough tables that sort order alone isn't enough to scan.

Error handling: a failed regenerate leaves the token/thumbnail unchanged (no optimistic update before the mutation succeeds). A failed PDF generation returns no partial file. Two regenerate calls racing on the same table is last-write-wins — no locking, since it's a single-admin, low-stakes action with no data corruption possible. A guest who scans a QR after it's been regenerated (or after the table's been hidden) hits `resolve_qr_token`'s existing no-match path — same neutral empty state as any invalid token (`app/qr/[qrToken]/route.ts`), no dedicated stale-QR UX needed.

Reuse rules:
- **New platform-only page** (no restaurant context, admin-only — e.g. the Dineinly Staff or Dineinly Settings cards on `/admin`): put it under `app/admin/`. The existing `admin/layout.tsx` gates the whole tree — never add a redirect/auth check to the page itself.
- **New restaurant-scoped page** (menu, staff, billing, etc.), reachable by both that restaurant's own staff and Dineinly Admin viewing it: put it under `app/restaurants/[restaurantId]/`. One `restaurants/[restaurantId]/layout.tsx` calling `requireRestaurantAccess(restaurantId)` gates the whole tree, same rule. Staff and Admin share this tree because they share the *same credential* (Supabase Auth cookie) — `requireRestaurantAccess` is one function branching on claim vs. Staff row, not two pages: Dineinly Admin always passes; any other viewer passes only if a `staff_select_own_row`-scoped query (§ 5 above) finds an active Staff row at that `restaurant_id`. This grants page-level access only — every staff role reaches the same restaurant tree once past this gate; a page needing a narrower reach (Staff Roster, Menu Desk, Table Matrix, Bills) adds its own `layout.tsx` calling `requireRestaurantRole(restaurantId, allowedRoles)` instead — it layers a role check on top of `requireRestaurantAccess` (deduped by that function's own `cache()` wrapper, so it's not a second round trip) and redirects to the restaurant home page if the caller's role isn't in `allowedRoles`. See "Feature-level staff permissions" in `Tbd.md` for what's still unsplit (Analytics — the page doesn't exist yet).
- **New guest-facing page** (menu, cart, orders, bill): put it under `app/guest/`. No id in the URL — restaurant/session identity lives entirely in the guest JWT cookie, already read via `server/trpc/context.ts`, not via a route param (`docs/product.md`: "a QR code is access-only, never business state" — the same principle applies to every guest URL downstream of it). A `guest/layout.tsx` may exist for shared UI chrome (e.g. a persistent tab bar across those pages) but must never redirect on a missing/invalid guest cookie — that's not an error state, it's just "no data," already handled by RLS. Guests never sign in, so there is nowhere to redirect them to.
- **Guest can never be folded into the `restaurants/[restaurantId]` tree**, even though it's tempting since both eventually render a menu: guest uses a structurally different credential (self-signed JWT vs. Supabase Auth session), and a Next.js layout can't be selectively bypassed by a child route — a guest page placed under `restaurants/[restaurantId]` would always run `requireRestaurantAccess` first and get redirected to `/sign-in`. If a restaurant-scoped page and a guest page render overlapping content (e.g. both list menu items), share the rendering **component**, not the **route**.

### Restaurant Sub-Navigation & Admin Exit

Both trees' home pages (`app/admin/page.tsx`, `app/restaurants/[restaurantId]/page.tsx`) render only a logo/profile header, never a nav bar — they're the landing surface itself, so a tab strip back to where you already are is redundant. Every other page in both trees renders its tree's nav header for chrome and the tab strip: `AdminNavHeader` (`admin/admin-nav-header.tsx`) under `app/admin/`, `RestaurantNavHeader` (`restaurants/[restaurantId]/restaurant-nav-header.tsx`) under `app/restaurants/[restaurantId]/`. Both follow the same shape — `NAV_ITEMS`/`NAV_ROUTES` driving an active-tab strip, unbuilt destinations rendered inert rather than omitted.

`RestaurantNavHeader`'s file also exports `DirectoryLink`, rendered inline in a `shrink-0` group with `AdminHeaderActions` at the end of the header row (kept off the nav tab list's own `overflow-x-auto` scroll region, so it can't be scrolled out of view as tabs are added) — an `ArrowLeftFromLine` icon plus "Restaurants Directory" text, per §11's icon + text "exit/utility strip" tier. `DirectoryLink` renders `null` for non-admin viewers: a restaurant's own staff has no directory to leave to.

`isAdmin` reaches these client components via `RestaurantViewerProvider` (`viewer-context.tsx`), a React Context populated in `restaurants/[restaurantId]/layout.tsx` from the `Viewer` already returned by `requireRestaurantAccess` — no extra fetch.

`DirectoryLink` is a single hop back to the Directory, never a multi-level trail — switching between a restaurant's own sub-pages (Menu Desk, Staff Roster, etc.) is the nav header's tab strip's job, not `DirectoryLink`'s. The Restaurant Directory (`app/admin/restaurants/restaurant-row.tsx`) links into a restaurant via an explicit "Open" action per row, landing on the restaurant home page (`app/restaurants/[restaurantId]/page.tsx`).

### Bills Tab

Bill procedures live in `apps/web/server/routers/bills.ts`, gated by `authedProcedure` — same any-active-staff reach as Table Matrix/Menu Desk (`staff_all_table_sessions`/`staff_all_bills`/`staff_all_cart_items` RLS, `supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql` § 5, added alongside these routes — staff had no reach on `table_sessions`, `bills`, or `cart_items` at all before). Most mutations (`request`, `waiveServiceCharge`, `cancelOrderItem`, `settle`) are plain single-table `ctx.auth` writes guarded by an atomic `where` clause, same pattern as `tables.ts`'s `updateFreeTable` — a single-staff, low-stakes action doesn't need a database function. `closeSession` is the exception: it frees potentially several tables (a merged session), hard-deletes cart items, and closes the session in one transaction, so it calls `close_session()` (§ 14 of the RLS migration) instead, the same reasoning as `submit_order()`.

`list` returns one row per table session, not per `Bill` row — a session with no `Bill` row yet (nobody has pressed Request Bill) is presented as the virtual `open` state, computed the same `computeBill` (`apps/web/lib/bill-math.ts`) way the guest bill screen already does. `get` (the detail view) never calls `request_bill()` as a read side effect the way `guest.bill.get` does — opening a row to look shouldn't itself flip a bill `open → requested`.

## Authorization & Idempotency

- RBAC (matrix in `product.md`) is enforced server-side on every mutation; client-side checks are UX-only.
- Dineinly Admin is the only cross-tenant path (audited). No other code crosses tenant boundaries.
- **Submit Order** is the only money-affecting mutation guarded against duplicates: a client-supplied `idempotency_key` (globally unique on Order, not just per-restaurant) makes retries/repeated taps from the *same* client safe. A second guard covers the *different*-client case a key can't: two participants on the same shared table session (`core-data-model.md`) confirming near-simultaneously each with their own key — `submit_order()` takes a `for update` lock on the `table_sessions` row before reading the cart, so the second caller's cart-to-order copy always sees the first caller's already-cleared cart instead of duplicating it. Cart edits are naturally idempotent (row-level, last-write-wins); cancel/modify are guarded by order state (only while `placed`), not by keys. See `core-data-model.md`.
- **Counter payment gating.** The staff mutation that advances an Order Item to `preparing` checks the session's Bill.status first, for counter-experience sessions only — `settled` required, same rejection shape as any other guarded write. No new mutation: marking a counter Bill `settled` is the same Mark Bill Settled action dine-in already has, just gating kitchen progress instead of only closing the session.
- **Multi-table guest mutations** (Submit Order, Request Bill) execute as `SECURITY DEFINER` Postgres functions, called via `supabase.rpc()` with the guest JWT forwarded as the bearer token — the same pattern as every other guest request, so no separate credential exists. A function body is one transaction: writing the Order, its Order Items, and clearing the Cart Items happen together or not at all, with no app-level connection to Postgres needed. Tenancy and identity come only from `auth.jwt()` claims read inside the function, never from arguments — a guest cannot name a session, item, or price; item prices and tax rates are read fresh from `menu_items`/`menu_categories` inside the function, never accepted from the client. Retries return the already-created row via `on conflict (idempotency_key) do nothing returning id`, falling back to a select on conflict. For counter-experience sessions, `submit_order()` also transitions the session's Bill to `requested` in the same transaction (`core-data-model.md` § Lifecycle invariants) — the guest gets a token without a separate Request Bill call. Each function follows the same hardening as the RLS helper functions in `supabase/migrations/*_add_auth_fk_and_rls_policies.sql`: `set search_path = ''`, every table reference schema-qualified, `execute` revoked from `public` and granted only to `authenticated`, and the guest-session-liveness check as its first statement.

## Real-Time

Real-time is a core capability across guests, waiters, kitchen, and managers; the UI never requires refreshes. See `docs/realtime.md`. Transport is Broadcast from Database, on three topics: `session:{id}` (guests + staff), `restaurant:{id}` (staff), `menu:{restaurant_id}` (availability).

## Operational Standards

- **APIs:** thin clients, predictable contracts, consistent validation, business logic in APIs.
- **Performance:** optimize perceived speed; minimize requests and re-renders; lazy-load and cache responsibly.
- **Caching:** `unstable_cache` + tag-based `revalidateTag` for menu items, categories, restaurant settings only — low-write, high-read, safe to cache. `React.cache()` for per-request dedup, no invalidation needed. Orders, bills, sessions, table state stay uncached — correctness-critical, served live via tRPC + Broadcast. No Redis cache layer for MVP; `"use cache"`/Cache Components deferred until stable in Next.js 16 (currently experimental).
- **Errors:** recoverable, explain what happened, give the next action. Never fail silently.
- **Observability:** structured logs, traceable errors, every production issue diagnosable.

## Core Data Model

See `docs/core-data-model.md`. 11 tables: Restaurant, Staff, Restaurant Table, Table Session, Menu Category, Menu Label, Menu Item, Cart Item, Order, Order Item, Bill. Everything downstream (Drizzle schema, RLS policies, tRPC routers, Realtime channels, API contracts) derives from it. Do not invent entities or relationships outside that doc. `Restaurant.experience` gates ordering/kitchen/bill behavior per tenant — see that doc's Experience Gating section before touching any of those routers.

## AI Guidance

Preserve modularity, tenant isolation, real-time behaviour, and security. Prefer simpler solutions, minimise dependencies, avoid new infrastructure unless necessary. Follow `tech-stack.md`.
