# E2E test suite (Playwright)

Real-browser tests against the app's actual UI — every role, every major
flow. Separate from `apps/web/tests/**` (Vitest, mocked, no browser).

## Prerequisites

This suite is never auto-started — starting the dev server or Supabase
stack is a human/CI action, not something running Playwright triggers on
its own. Before running anything here:

```
pnpm db:start          # Supabase stack, if not already running
pnpm db:reset          # optional — a clean fixture baseline
pnpm dev                # in another terminal, if not already running
pnpm exec playwright install --with-deps chromium   # one-time
```

`playwright.config.ts` targets `http://127.0.0.1:3000`. If the dev server
or Mailpit (OTP inbox, `http://127.0.0.1:54324`) isn't reachable,
`global-setup.ts` fails fast with a message telling you what's missing
instead of every spec timing out individually.

## Running

| Command | Runs |
|---|---|
| `pnpm test:e2e` | the whole suite |
| `pnpm test:e2e:ui` | Playwright's interactive UI mode — pick any single test, watch it run, inspect the trace. The easiest way to invoke one flow for manual testing. |
| `pnpm test:e2e:sign-in` | Email OTP sign-in, wrong/expired code, resend cooldown, RBAC redirects |
| `pnpm test:e2e:admin-restaurants` | Dineinly Admin: Restaurants Directory CRUD, pause/reactivate |
| `pnpm test:e2e:admin-staff` | Dineinly Admin: Dineinly Staff roster CRUD |
| `pnpm test:e2e:staff-roster` | Owner/Manager: Staff Roster CRUD, resend invite, reassign primary owner, pairing-code entry point |
| `pnpm test:e2e:station-pairing` | Device pairing → PIN set → unlock → Switch User → revoke |
| `pnpm test:e2e:menu` | Menu Desk: category/label/dish CRUD, hide/show, sold-out toggle |
| `pnpm test:e2e:tables` | Table Matrix CRUD, QR download; Arbor's 30-table grid read-only |
| `pnpm test:e2e:kitchen` | Kitchen queue read + Start Preparing → Mark Ready → Mark Served |
| `pnpm test:e2e:floor` | Order for Guest, Merge Tables |
| `pnpm test:e2e:bills` | Request → correct → Waive Service Charge → Settle → Close, Force-Terminate |
| `pnpm test:e2e:guest-ordering` | QR scan → menu → cart → Confirm Order → realtime status → Request Bill → bill |
| `pnpm test:e2e:settings` | Venue Settings (Owner-only) |

Any of the above also accepts Playwright's own flags, e.g.
`pnpm test:e2e:bills -- --headed` or `pnpm test:e2e -- --grep @rbac`.

## How auth works here

- **Email OTP roles** (Dineinly Admin, Owner, Manager, individual
  Kitchen/Waiter) are signed in once by `global-setup.ts`, via the real
  `/sign-in` UI — it polls Mailpit's REST API for the 6-digit code
  (`helpers/mailpit.ts`) rather than shortcutting through the Supabase
  Admin API, so the suite proves that flow works for real, once per run.
  Every spec file then reuses the saved `storageState` instead of
  repeating the OTP round trip (`test.use({ storageState: ... })`,
  identities listed in `fixtures/roles.ts`).
- **Station PIN** (shared Kitchen/Waiter tablet) has nothing pre-seeded —
  `station-pairing.spec.ts` pairs a fresh device per test via the real
  `/station/pair` flow. Other specs needing "an authenticated
  waiter/kitchen session" use the individual OTP roles instead; only
  station-specific mechanics live in that one file.
- **Guest** needs no login — `helpers/tables.ts`'s `openGuestSessionForTable`
  creates a fresh table, copies its real QR scan URL off the clipboard
  (the same URL encoded into the QR image), and opens it in a brand-new
  browser context, exactly as a guest's own phone would.

## Data isolation

One real shared local Postgres, no per-test sandbox:

- Every CREATE uses `helpers/unique.ts` — never a fixed literal name.
- Restaurant 1 ("Dineinly Test Kitchen") hosts both read-only assertions
  against known seed state and CRUD; irreversible mutations (remove,
  force-terminate, reassign-owner) always target a row the test itself
  created, and reversible toggles restore themselves before the test ends.
- Restaurant 2 ("Arbor Brewing Company") stays strictly read-only.
- Kitchen/Floor/Bills/Guest-ordering specs each drive their own
  freshly-created table+session rather than the seeded active one, so
  those files have no run-order dependency on each other.
- `workers: 1` (serial) — the safe default; not proven safe to parallelize yet.

`pnpm db:reset` is never run automatically by anything in this directory.
