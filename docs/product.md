# Dineinly

## Vision & Mission

Dineinly is a premium restaurant platform delivering a seamless dine-in experience through real-time digital workflows, connecting guests, waiters, kitchen, managers, and owners in one shared live system.

Every feature must improve guest experience, staff efficiency, or restaurant visibility — otherwise it should not be built.

---

## Dineinly Experiences

Dineinly is sold as packaged experiences so a restaurant can adopt at their own pace, on top of whatever they already run — not as a single all-or-nothing platform. A restaurant picks one experience (not per touchpoint); moving between experiences is a flag flip on the same restaurant record — same staff, menu, and history, no re-onboarding.

Backed by a `restaurant.experience` field, set at signup and only ever changed from Dineinly Admin's Restaurants Directory (`admin_update_restaurant`) — never self-serve; Venue Settings (Owner-facing, see RBAC below) offers Restaurant Details only, no experience change. Every path only moves a restaurant within its own track (Full-Service or Quick-Service, see below) — crossing tracks isn't a toggle. Kitchen/Floor/Bills/Table Matrix are blocked outright for Menu (view-only) at both the route layer (`requireFullServiceExperience`, `apps/web/lib/auth.ts`) and the tRPC layer (`requireFullServiceRole`/`assertFullServiceExperience`, `apps/web/server/trpc/rbac.ts`). Guest and Counter still get One's behavior on those routers beyond the Counter payment gate (see Lifecycle invariants) — the deeper Guest-specific behavior below (no real-time order status, billing left to the restaurant's existing system) is not yet routed.

An experience change is a capability change, not a label — every guest session active under the old experience is force-terminated in the same transaction as the flip (same override as Force-Terminate Session below: unsettled bills voided, carts cleared, tables freed), so nothing is left stranded behind a route that just stopped existing for it. The Restaurants Directory confirms this with the admin before saving, naming what gets discarded. A Guest/One table QR also stops resolving the moment the restaurant leaves that track's Table Matrix (`resolve_qr_token`) — a leftover printed QR from before the change can't mint or rejoin a session behind it.

**Strategic shape:** Menu is the universal entry point. Guest is the adoption wedge — zero integration risk, sells itself on guest experience alone. One is the deep platform, full integration, the ceiling Guest grows into. Counter is a separate vertical entirely, not a deeper Guest — it serves quick-service restaurants, not an upgrade path for dine-in ones.

### Full-Service vs. Quick-Service

Every restaurant sits on exactly one of two tracks. The track is decided by an explicit question at signup — **does payment happen before or after food is served?** — not by restaurant category. A banquet hall or buffet that collects payment upfront runs on the Quick-Service track even with tables and waitstaff; a fast-casual spot that tabs guests and settles after the meal runs on Full-Service even though it feels quick.

```
                              Menu
                    (view-only, either track)
                       /                    \
              Full-Service track          Quick-Service track
             (pay after, staff-mediated)   (pay before, self-service)
                  |                              |
             Guest → One                      Counter
        (zero integration →           (terminal — full integration
         full integration)             is the only version that works)
```

A restaurant only moves within its own track (Menu→Guest→One, or Menu→Counter). Crossing tracks isn't a routine upgrade — different operating model, gets a real conversation, not a toggle.

- **Dineinly Menu** — view-only digital menu, either track. No ordering, no kitchen, no bill, no Table Matrix. Guests always see current prices/items/availability. Staff Roster only offers Manager/Owner — no Waiter or Kitchen role, since there's no floor or kitchen workflow to staff. One QR for the whole menu (not per-table), on its own QR Menu page — no Table Matrix, so it gets a dedicated route instead of living in Venue Settings.
- **Dineinly Guest** *(Full-Service)* — adds guest ordering on top of Menu, with zero change to the restaurant's existing systems. Guest sends an order request; staff sees it in Dineinly and manually re-enters it into their existing POS/kitchen process exactly as they do today — or simply walks back to the table to confirm with the guest. No real-time order status shown to the guest (nobody in Dineinly ever advances an item's status, so the ladder would just hang on "Preparing" forever). Billing is untouched — the restaurant's existing billing flow runs exactly as it always has, disconnected from Dineinly.
- **Dineinly One** *(Full-Service)* — full dine-in experience: real-time kitchen queue, live guest order status, full Bills tab (corrections, waivers, settlement). This is what's built today as MVP scope (see below) — the ceiling Guest grows into, not a separate build.
- **Dineinly Counter** *(Quick-Service)* — payment happens before food is prepared. Guest orders, gets a token + bill from Dineinly, pays at the counter (external — Dineinly never touches the transaction), and only once payment is confirmed does the order auto-fire to kitchen; guest gets a ready notification. Terminal on its track by design: the pain point this track solves is queue/throughput, not staff availability, so only the payment-gated automation earns its keep — a lighter "digital order capture, staff still manually re-keys and relays to kitchen" version wouldn't move the line, so it isn't offered. Also has no Table Matrix, but unlike Menu its one QR stays on Venue Settings rather than getting a dedicated route — no per-table rows to separate it from.

## Principles

- **Guest experience first** — technology disappears into the dining experience; guests never need instructions.
- **Real-time by default** — every participant always sees the latest state; no refreshes, no stale data.
- **Simplicity wins** — fewest clicks, screens, decisions.
- **Premium, not enterprise** — elegant, calm, modern hospitality feel.
- **Mobile-first** — guest and floor interactions are phone-first; desktop is for management only.
- **Speed matters** — every second saved during service improves the experience.

**Optimization priority:** Simplicity > Speed > Reliability > Real-time collaboration > Premium UX. Never optimize for feature count.

**Brand:** premium, modern, minimal, fast, elegant, calm, trustworthy. Never: enterprise, legacy, corporate, complex, overloaded.

---

## Roles

Permissions are defined precisely in RBAC below; this is persona context only.

- **Guest** — dines in, orders via QR, no account.
- **Waiter** (Service Staff) — manages tables, places/serves orders, settles bills.
- **Kitchen** — prepares orders, sets item availability.
- **Manager** — daily operations, staff, analytics.
- **Owner** — full restaurant configuration and control.
- **Dineinly Admin** — Dineinly-operated, platform-wide support. The only role permitted cross-tenant access; every action audited.

---

## MVP Scope

**In:** QR menu, live ordering, shared session, kitchen workspace, waiter ordering, bill generation & settlement, restaurant management, onboarding & staff setup.

**Non-Goals** (do not build until prioritized): Payments, Loyalty, Delivery, Reservations, Payroll, Accounting, Hardware integrations, Menu images/photography, Inventory management, Customer accounts, Offline mode, Multi-branch support, Allergen data.

---

## Onboarding & Setup

- **QR codes:** Owner/Manager generates and downloads one QR per restaurant table, from the Table Matrix. Each table's QR can be regenerated (rotates the token — the old printed QR stops working immediately; any active session on the table is unaffected). Download is per-table or all-at-once for the restaurant.
- **Table Matrix:** create, edit (label), and hide (soft-delete) restaurant tables. A hidden table drops off the matrix and its QR stops resolving for guests — scanning it lands on the same neutral empty state as any invalid QR. It can be shown again later; hiding never deletes the row or its `qr_token`, so nothing needs reprinting on restore. An occupied table's config is off-limits mid-service: Edit, Regenerate, and Hide are all unavailable while a session is active — only Show QR remains. The card doesn't offer the disabled actions at all, and the same rule is enforced server-side.
- **Staff invites:** Owner/Manager invites by email; invitee verifies via Email OTP. Managers may invite Managers, Waiters, Kitchen — never Owners. An invite is only valid for 24 hours (Staff Roster shows it as "Expired" past that); Owner/Manager resends from the roster row, restarting the window, same reach as inviting.
- **Daily auth** follows the role model (see `architecture.md` → Authentication).
- **Menu** is created manually via Manage Menu — no import in MVP.

---

## Menu

Organized into restaurant-defined categories; every item belongs to exactly one. Text-only — no images, no allergen data.

**Required:** Name, Description, Price, Prep time (display-only, not used for timing/calculation — one of `5-10 mins` / `10-15 mins` / `15-20 mins` / `20-30 mins` / `30-45 mins`), Serving size (one of `Serves 1` / `Serves 1-2` / `Serves 2` / `Serves 2-3` / `Serves 4-5` / `Serves 5+`), Diet (Veg / Non-Veg only), Category.

**Optional:** Label (at most one, picked from the restaurant's own label list — Owner/Manager adds new labels from Menu Desk, e.g. Chef Recommended, Seasonal), Spice, Salt, Ice (each a plain checkbox — offered or not, shown for every dish).

Spice, Salt, Ice are the only guest-selectable option groups in the MVP. At item creation the Owner/Manager only toggles whether each applies to the dish — the values themselves (Spice: Mild / Regular / Extra Spice; Salt: Less Salt / Regular; Ice: No Ice / Less Ice / Regular) are fixed per preference and chosen by the guest at order time, never during dish creation. Preferences never change price.

**Availability:** `Available` or `Sold Out (86'd)`. Manual only — set by Waiter, Kitchen, or Manager. Changes affect future orders only, never existing ones.

---

## Shared Session

The Session is a guest's one continuous, QR-scanned presence at the restaurant — for Full-Service, a dining visit at a table; for Counter, the whole stay their single token covers, however many times they order and pay along the way. One Session, one guest-facing identity, for as long as they're there — see "A bill paid, then another order" below for exactly what that means per bill.

- Restaurant → restaurant tables → QR codes. A QR code is access-only, never business state.
- A restaurant table has zero or one active session. An active session may span multiple restaurant tables (via merge). Counter has no tables at all — every guest shares one restaurant-level QR instead, and each scan starts its own session.
- One active session = exactly one shared cart, one or more bills, one or more participants, one or more orders.
- Scanning a QR resolves to its restaurant table, then joins the table's active session or creates one (Counter: always creates a new one, since the one QR serves many concurrent guests).
- Guests are anonymous — no name collected, no per-guest attribution.
- **Cart:** any participant edits freely before confirming (concurrent edits are last-write-wins). Confirming sends the cart to the kitchen as an order (one round) and clears the cart. A session accumulates orders across the meal; each bill round aggregates the orders placed against it.
- **Merge:** Waiter/Manager/Owner merges restaurant tables into one session/cart/bill. Not reversible within the session. **MVP only merges a free (session-less) table into an existing session** — two already-active sessions are never merged. Full-Service only — Counter has no tables to merge.
- **Close:** requires no orders in progress and every bill the session has drawn settled. Any Waiter/Manager/Owner may close — no override needed. Closing archives the session and frees the tables. Full-Service only, since an occupied table needs bussing before the next party is seated — a physical step no automated signal can confirm. Counter's tableless sessions close automatically instead: idle-swept once every bill is settled and every item served/picked up, no guest or staff action needed (see "A bill paid, then another order" below). A session that scanned the QR but never ordered at all — nothing to bill, no financial record — idle-sweeps the same way, purely off time-since-scanned; the Bills tab never lists it (no bill, nothing to act on), so it's never manually reachable there. A session that did draw a bill still shows in the Bills tab for as long as it's unsettled or unfinished, and staff/Dineinly Admin can still force-terminate that one manually at any time (e.g. at closing, for a bill nobody came back to settle).
- **Force-terminate:** Waiter/Manager/Owner may force-close an abandoned session (walkout), freeing the tables. Any open or requested bill is voided (deleted) rather than settled — the session's history then shows no bill at all, same as one that was never requested. An already-settled bill is untouched.
- **Restaurant status (Pause/Reactivate):** Dineinly Admin only, from the Restaurants Directory (`admin_set_restaurant_status`) — never self-serve. Pausing a restaurant applies Force-Terminate's own override across every active session on that restaurant at once, then blocks new sessions from starting (QR scans and Table Matrix resolution both check `restaurant.status`). Reactivating is a plain status flip; Force-Terminate's effects aren't undone. An experience change (above) applies this same override, scoped to that restaurant's active sessions, whenever the experience actually changes.
- **Dineinly Menu idle self-close:** a Menu session has no order/bill to protect (view-only), so it ends itself — the guest's own browser calls `end_own_guest_session()` once nobody has touched the page in 10 minutes, rather than riding out the full guest token lifetime or waiting on staff.
- **Bill cardinality:** One/Guest — exactly one bill per session, ever, no split bills. Counter — one bill at a time, but a session can draw more than one over its life (see below).

---

## Order Lifecycle

**Item states:** `Placed` (auto, system event) → `Preparing` (Kitchen) → `Ready` (Kitchen) → `Served` (Waiter). `Cancelled` is terminal and reachable only from `Placed`; never after `Preparing`/`Ready`. Kitchen never cancels, only advances status. Dineinly Counter has no Waiter station, so Kitchen also sets `Served` there — self-service pickup, not a delivered plate — and `Placed` → `Preparing` additionally requires that item's own bill (not necessarily the whole session's, if it's ordered a second round — see "A bill paid, then another order" below) to be `settled` **and** the guest to have sent that item to the kitchen (see `core-data-model.md` § Lifecycle invariants).

**Cart vs. Order:** pre-confirm is the cart (any participant edits it). Post-confirm it's an order in `Placed`, and the lock point from there splits by experience: Full-Service (One/Guest) fires to kitchen on `Placed` immediately, so the guest is locked out the moment they confirm — from then on only Waiter/Manager/Owner may cancel or modify a line, and only while it's still `Placed` (before Kitchen advances it). Counter never fires anything to kitchen until its bill settles (see Item states above), so nothing is at stake yet — the guest keeps full self-service edit rights on their own placed lines (reduce a quantity, cancel one outright) for as long as that bill is `open`/`requested`; settlement, not confirm, is Counter's lock point. `set_order_item_quantity()` is the guest-side mechanism (`docs/core-data-model.md` § Lifecycle invariants) — same quantity-replaces-outright shape as the Bills tab's Counter-only pill (below), just guest-callable and gated to the caller's own session instead of a staff role.

**Guest-facing status** (derived, never shows internal states): Full-Service (One) shows `Preparing` → `Partially Served` → `Served` — the guest sees `Preparing` immediately on confirm, no distinction between submitted and kitchen-started, since kitchen fires on `Placed` immediately there. Counter shows `Awaiting Payment` → `Ready to Send` → `Preparing` → `Ready for Pickup` instead — `Awaiting Payment` until the bill settles, then each paid item sits `Ready to Send` until the guest taps "Send to Kitchen" on it individually (`release_order_item_to_kitchen()`, `order_items.released_at`); `Preparing` only starts once an item is both released and the bill is `settled` (kitchen is gated on both, see Item states above), so showing it any earlier would be false. `Partially Served`/partial `Ready for Pickup` are derived automatically, never set manually.

Availability changes (see Menu) never modify existing orders.

---

## RBAC

All permissions are enforced server-side. Client-side checks are UX-only, never security.

| Action | Guest | Waiter‡ | Kitchen | Manager | Owner | Dineinly Admin |
|---|---|---|---|---|---|---|
| View Menu | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add to Cart | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Submit Order | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Cancel / Modify Order (pre-prep only) | ❌§ | ✅ | ❌ | ✅ | ✅ | ✅ |
| View Kitchen Queue | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update Order Status (`Preparing`/`Ready`) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Serve Order (set `Served`) | ❌ | ✅ | ❌† | ✅ | ✅ | ✅ |
| Merge Tables | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Request Bill | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Mark Bill Settled | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Close Session | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Force-Terminate Session | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Manage Tables & QR Codes | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage Menu | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Update Item Availability (86'd) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Staff | ❌ | ❌ | ❌ | ✅* | ✅ | ✅ |
| View Analytics | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Restaurant Settings | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Pause/Reactivate Restaurant | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Change Dineinly Experience | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

§ Full-Service (One/Guest) only — locked for the guest the instant they confirm. Counter isn't: nothing fires to kitchen pre-settle, so the guest keeps this on their own placed lines until their bill settles (`set_order_item_quantity()`, `docs/core-data-model.md` § Lifecycle invariants) — the one cell in this table that isn't a flat yes/no across experiences.
\* Managers may create/manage Waiters, Kitchen, and other Managers — never Owners.
† Dineinly Counter has no Waiter station — Kitchen sets `Served` there instead (self-service pickup).
‡ The Waiter column above is a PIN-unlocked station session only. A Waiter's own personal OTP login (`/sign-in`) reaches none of it — it's account-management only (update their own name/PIN, "Pair This Device" to `/station/pair`), same as every other role's login otherwise. Server-enforced in both places: the route layer (`requireNonIndividualWaiterAccess`, `apps/web/lib/auth.ts`) and the tRPC layer (`requireStaffRole`, `apps/web/server/trpc/rbac.ts`). See `docs/architecture.md` § Station Account Provisioning.

---

## Billing & Settlement

Dineinly never facilitates, processes, or records payment transactions.

**In scope:** bill generation, tax (per-category rate, always exclusive), bill presentation (incl. restaurant address/GST number/state/pincode header), settlement workflow, session closure.

**Settlement** = the restaurant confirms payment via an external method (cash, card terminal, UPI, bank transfer, etc.) → Dineinly marks the bill settled → the session closes. No payment gateway, processing, or status sync.

### Bill status

Three states, own lifecycle (`core-data-model.md`), always moving forward:

- **Open** — the session has a cart/orders but nobody has asked for the check yet. No `Bill` row exists; the total shown anywhere is derived live from `order_items`.
- **Requested** — Guest, Waiter, Manager, or Owner pressed Request Bill. Still derived live — the kitchen may still be finishing served items, and staff can still correct eligible order items.
- **Settled** — staff confirmed the restaurant received payment externally. Amounts are frozen from this point on; nothing about the bill changes again except closing the session.

### Bills tab

Restaurant-scoped page (`app/restaurants/[restaurantId]/bills`), reachable by any active staff member — same not-yet-role-gated reach as Table Matrix/Menu Desk (`Tbd.md` "Feature-level staff permissions"); the RBAC table above states the target per-role split. One row per session — a session gets a row the moment it opens, before anyone has ever pressed Request Bill (shown as Open with no bill number yet). The row always reflects the session's *current* round; if a Counter session has drawn more than one bill over its life, the detail view also lists the earlier, already-settled rounds (bill number/token, total, settled time) underneath, so staff and Dineinly Admin can see the full visit, not just what's owed right now.

- **View Bill** — list view mirrors Menu Desk/Table Matrix/Restaurant Directory: status, bill number, table, live or frozen total. Filters: Today by default, an exact-date picker as the sole override (every currently active session always shows regardless of the filter), status pills, and search by bill number or table. Opens into a line-item editor — deliberately not a printed-bill look, that's reserved for the guest screen — with a correction action per row.
- **Generate / Request Bill** — staff-side equivalent of the guest's own Request Bill; same effect (`open` → `requested`), for tables that never self-request (e.g. no phone use that visit).
- **Correct eligible order items** — cancel some or all of a line's quantity, only while it's still `placed` (RBAC "Cancel/Modify Order (pre-prep only)", `core-data-model.md`'s "cancelled reachable only from placed"). Staff set the cancelled quantity per line (0 up to the ordered quantity), excluding it from both bill math and the kitchen queue; reaching the full quantity cancels the line outright, which is irreversible. Unavailable once the bill is settled, even if an item is technically still `placed` — a correction after settle wouldn't reach the frozen total, which would silently make the printed bill wrong.
- **Waive an order item** — excludes some or all of a line's quantity from bill math without touching its status or quantity, for exceptional cases a cancel doesn't cover: a quality complaint on an already-served dish, or a short-served quantity (e.g. 3 ordered, only 2 came out). Staff set the waived quantity per line (0 up to the ordered quantity, minus whatever's already cancelled); any non-cancelled item is eligible regardless of prep stage. Adjustable any time before settle, unavailable after.
- **Print / Download Bill** — Print is the browser's own print of a dedicated print-only receipt block (same layout and merged line items as the guest bill screen, hidden on screen and shown only in print/PDF); Download renders the same content server-side as a PDF, consistent regardless of the staff member's browser (same reasoning as Table Matrix's QR PDFs).
- **Mark Bill Settled** — freezes subtotal/tax/total onto the `Bill` row. Only available once the bill is `requested` — the status ladder is always `open` → `requested` → `settled`, never a direct `open` → `settled` skip.
- **Close Session** (Full-Service) — only once every bill the session has drawn is settled and every order item across all of them is `served` or `cancelled` (nothing left `placed`/`preparing`/`ready`). Frees every table in the session (a merged session can span more than one), hard-deletes any unfired cart items, marks the session `closed`. Counter has no equivalent button — see "A bill paid, then another order" below.

**Boundaries — what Bills can and can't edit:** the tab only ever touches `Order Item.status` (cancel, pre-prep only), `Order Item.waivedQuantity` and `Order Item.cancelledQuantity` (partial-quantity corrections; a fully cancelled quantity also sets `status`), and the `Bill` row itself (status, frozen totals at settle). It never edits menu prices, tax rates, or the ordered quantity itself, and never adds/removes anything from an order — a wrong quantity or wrong dish is a partial or full cancel, and a quality complaint or short-served item is a waiver; neither is ever a direct price edit, same boundary the guest ordering flow already draws around a placed order.

### A bill paid, then another order

The risk in both experiences is the same shape: a new order landing after a bill's total is already frozen, silently diverging from what the guest actually paid. The fix is opposite, because what "another order" means to the guest is opposite too.

**Full-Service (One/Guest):** paying is how the visit ends — like a paper receipt handed back at the end of a meal, there's no expectation of ordering more against it. Once a session's one bill is `settled`, Confirm Order fails for that session with a clear error, for guest and staff alike, and stays that way permanently — a settled bill never reopens. Getting more food means a genuinely new visit: staff hits Close Session, freeing the table; the *next* QR scan on that table then opens a brand-new session (a closed session is never "active", so a fresh scan can only create a new one). The settled bill stays exactly as printed in the Bills tab history; the new order lands on the new session with its own new bill.

**Counter:** paying doesn't end anything — like a paper token a guest holds onto and returns to the counter with, the whole point is that one continuous presence covers ordering, paying, and coming back for more, any number of times. Confirm Order never blocks a Counter session on a settled bill: the guest taps "Order More" (a plain link back to the menu — no rescan, no new token, same session), and their next confirm draws a **fresh bill** for the new round instead of reopening the frozen one. The settled round stays exactly as printed in the Bills tab's Previous Rounds history; the kitchen gate, guest-facing status ladder, and Send to Kitchen all key off *that round's own bill*, so an earlier settled round can never wave a later, still-unpaid one through. The session itself only ever ends via the idle auto-close described in Shared Session above (or a manual staff force-terminate) — never by the guest paying.

---

## Roadmap

**Before go-live:** analytics (event capture + KPI/dashboards). No analytics work — including event capture — until core flows ship. `analytics_events` table stays deferred (see `core-data-model.md`).

**Post-MVP** (revisit after first restaurant): AI recommendations, advanced analytics, Python/FastAPI + Railway, image treatment / menu imagery, manager step-up, light mode.

---

## Success Definition

- A restaurant can go live in under 30 minutes.
- Guests can order without assistance.
- Staff require almost no training.
- Orders flow from guest to kitchen in real time.
- Owners gain meaningful operational insights.

---

## AI Guidance

- Prefer removing features over adding them.
- Respect MVP scope.
- Preserve simplicity.
- Maintain a premium dining experience.
- Prioritise guest experience over internal convenience.
- Avoid unnecessary configuration.
