# Dineinly

## Vision & Mission

Dineinly is a premium restaurant platform delivering a seamless dine-in experience through real-time digital workflows, connecting guests, waiters, kitchen, managers, and owners in one shared live system.

Every feature must improve guest experience, staff efficiency, or restaurant visibility — otherwise it should not be built.

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

**In:** QR menu, live ordering, shared table session, kitchen workspace, waiter ordering, bill generation & settlement, restaurant management, onboarding & staff setup.

**Non-Goals** (do not build until prioritized): Payments, Loyalty, Delivery, Reservations, Payroll, Accounting, Hardware integrations, Menu images/photography, Inventory management, Customer accounts, Offline mode, Multi-branch support, Allergen data.

---

## Onboarding & Setup

- **QR codes:** Owner/Manager generates and downloads one QR per restaurant table.
- **Staff invites:** Owner/Manager invites by email; invitee verifies via Email OTP. Managers may invite Managers, Waiters, Kitchen — never Owners.
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

## Shared Table Session

- Restaurant → restaurant tables → QR codes. A QR code is access-only, never business state.
- A restaurant table has zero or one active session. An active session may span multiple restaurant tables (via merge).
- One active session = exactly one shared cart, one bill, one or more participants, one or more orders.
- Scanning a QR resolves to its restaurant table, then joins the table's active session or creates one.
- Guests are anonymous — no name collected, no per-guest attribution.
- **Cart:** any participant edits freely before confirming (concurrent edits are last-write-wins). Confirming sends the cart to the kitchen as an order (one round) and clears the cart. A session accumulates orders across the meal; the bill aggregates all of them.
- **Merge:** Waiter/Manager/Owner merges restaurant tables into one session/cart/bill. Not reversible within the session. **MVP only merges a free (session-less) table into an existing session** — two already-active sessions are never merged.
- **Close:** requires no orders in progress and the bill settled. Any Waiter/Manager/Owner may close — no override needed. Closing finalizes and settles the bill, archives the session, and frees the tables.
- **Force-terminate:** Waiter/Manager/Owner may force-close an abandoned session (walkout), freeing the tables. Void vs. settle handling of any open bill is `TBD` — decided at implementation, flag before guessing.
- **MVP limitation:** one bill per session — no split bills.

---

## Order Lifecycle

**Item states:** `Placed` (auto, system event) → `Preparing` (Kitchen) → `Ready` (Kitchen) → `Served` (Waiter). `Cancelled` is terminal and reachable only from `Placed`; never after `Preparing`/`Ready`. Kitchen never cancels, only advances status.

**Cart vs. Order:** pre-confirm is the cart (any participant edits it). Post-confirm it's an order in `Placed`; only Waiter/Manager/Owner may cancel or modify it, and only while still `Placed`.

**Guest-facing status** (derived, never shows internal states): `Preparing` → `Partially Served` → `Served`. The guest sees `Preparing` immediately on confirm — no distinction between submitted and kitchen-started. `Partially Served` is derived automatically, never set manually.

Availability changes (see Menu) never modify existing orders.

---

## RBAC

All permissions are enforced server-side. Client-side checks are UX-only, never security.

| Action | Guest | Waiter | Kitchen | Manager | Owner | Dineinly Admin |
|---|---|---|---|---|---|---|
| View Menu | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add to Cart | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Submit Order | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Cancel / Modify Order (pre-prep only) | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| View Kitchen Queue | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update Order Status (`Preparing`/`Ready`) | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Serve Order (set `Served`) | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
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

\* Managers may create/manage Waiters, Kitchen, and other Managers — never Owners.

---

## Billing & Settlement

Dineinly never facilitates, processes, or records payment transactions.

**In scope:** bill generation, tax (per-category rate, always exclusive), service charge (per-restaurant), bill presentation (incl. restaurant address/GST number/state/pincode header), settlement workflow, session closure.

**Settlement** = the restaurant confirms payment via an external method (cash, card terminal, UPI, bank transfer, etc.) → Dineinly marks the bill settled → the session closes. No payment gateway, processing, or status sync.

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
