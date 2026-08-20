# Waiter Station Account + PIN Login — Design

Builds the "device pairing" half of `Tbd.md`'s "PIN station login for
Kitchen/Floor" entry, scoped to Waiter only. Implements
`docs/architecture.md` § Station Account Provisioning, which is
pre-approved design — this spec fills in the implementation gaps that
section leaves open (exact routes, session mechanism, PIN uniqueness,
revocation), it does not re-litigate it.

## Scope

**In:** shared floor-tablet station account, Owner/Manager-generated
pairing code, device pairing flow, PIN-based "acting as" attribution on a
paired device, per-device revocation, PIN uniqueness enforcement.

**Out (explicitly deferred, not silently dropped):**
- Kitchen station — identical pattern, separate follow-up pass.
- PIN entry per-action — one unlock persists for the shift (12h), per user decision.
- QR-encoded pairing code (device camera scan) — manual 6-digit entry only.
- Instant device-kill on revoke — revocation takes effect on that device's
  next floor-page navigation, not mid-session. Matches the effort level of
  everything else already accepted as a gap (`Tbd.md` "No app-level OTP
  rate limiting").
- PIN brute-force lockout — same posture as the existing OTP gap.
- `last_seen_at` / device activity tracking beyond `paired_at`.

## Identity model

No new identity concept. A station is exactly what `staff.ts`'s header
comment already describes: one `Staff` row, `role = 'waiter'`, `user_id`
pointing at a synthetic `auth.users` identity
(`waiter-<restaurant_id>@stations.dineinly.internal`). Named waiters keep
today's unchanged path — invited by email, individually link via OTP once,
self-set their own PIN via the existing `set_staff_pin` / Profile sheet
flow. Nothing about that flow changes; PIN unlock on a paired device is a
faster **daily** entry point layered on top of it, not a replacement for
onboarding.

The station row is distinguished from a real named waiter purely by its
synthetic email suffix — no new boolean column. Staff Roster's list
filters/labels rows whose email ends `@stations.dineinly.internal` as
"Floor Tablet (Shared)": not editable/removable via the normal staff
actions, never carries a PIN of its own.

## Data model (new migration — these are new tables, nothing to fold into)

```
station_pairing_codes
  id, restaurant_id, station_type ('waiter'), code_hash,
  expires_at, redeemed_at, created_by_staff_id, created_at

station_devices
  id, restaurant_id, station_type ('waiter'), paired_at,
  revoked_at, created_at
```

`station_type` is a real column (not hardcoded away) so the Kitchen
follow-up reuses both tables without a migration.

## Existing-file changes (fold into the migration that first defined them, per pre-launch rule)

- `set_staff_pin` (`20260816164344_add_staff_roster_rpcs.sql`): add a
  same-restaurant collision check before writing — loop active
  `waiter`/`kitchen` rows at that restaurant, `crypt()`-compare the
  candidate PIN, reject with a clear error on any match. `pin_hash` is
  salted bcrypt, so this can't be a DB unique index; it has to be an
  application-level check inside the function. Small staff counts per
  restaurant keep this cheap.
- New RPCs added to the same file (both `SECURITY DEFINER`):
  - `generate_pairing_code(p_restaurant_id, p_station_type)` — caller must
    be an active Owner/Manager at that restaurant. 6-digit code, hashed,
    10-minute TTL.
  - `redeem_pairing_code(p_code)` — no caller session exists yet. Matches
    against unexpired/unredeemed rows, burns on match, returns
    `restaurant_id` + `station_type`. Does not create the `auth.users`
    identity — SQL can't call the Auth Admin API; that happens in
    TypeScript right after.
  - `resolve_staff_by_pin(p_restaurant_id, p_pin)` — caller must already
    hold an active Staff row at `p_restaurant_id` (i.e., must already be
    the paired station session). Compares against active `waiter` rows'
    `pin_hash`; returns the matched staff id + display name only on
    exactly one match. Never returns `pin_hash`, never distinguishes "no
    match" from "ambiguous match" in its response — same anti-enumeration
    posture as `resolve_staff_signin`.

## New server code

- `apps/web/server/routers/station.ts` — new router, mirrors
  `admin-staff.ts`'s use of the service-role client
  (`lib/supabase/admin.ts`) for the one step SQL can't do:
  - `generatePairingCode` — Owner/Manager-gated, wraps the RPC.
  - `redeemPairingCode` — `publicProcedure` (device has no session yet).
    Redeems the code via RPC, lazily creates the station's `auth.users` +
    `Staff` row on first-ever pairing for that restaurant (idempotent:
    look up by synthetic email first), mints a magic-link token via
    `auth.admin.generateLink()`, inserts a `station_devices` row, returns
    `{ email, tokenHash, restaurantId, deviceId }` to the client.
  - `revokeDevice` — Owner/Manager-gated, sets `revoked_at`.
  - `listDevices` — Owner/Manager-gated, for the Staff Roster panel.
- `apps/web/lib/station-session.ts` — new, small. HMAC-signs (via `jose`,
  already a dependency) an `{ staffId, restaurantId, exp }` cookie with a
  new `STATION_PIN_SECRET` env var. This is deliberately **not** the
  guest-token pattern (`lib/guest-token.ts`'s RS256 Supabase-trusted key)
  — that key exists so Supabase itself trusts the token as a Postgres
  role claim. This cookie never reaches Supabase; architecture.md is
  explicit that PIN grants "no DB access," so a lightweight app-only HMAC
  is the right-sized mechanism, not a second Supabase-trusted signer.
  12-hour flat expiry (matches the existing `GUEST_TOKEN_MIN_TTL_SECONDS`
  convention), no sliding refresh.
- One new Route Handler, the same sanctioned exception to "tRPC only"
  that `app/qr/[qrToken]/route.ts` already uses for guest-cookie issuance
  — auth-cookie issuance isn't CRUD:
  `apps/web/app/station/pin/route.ts` — `POST` verifies a PIN (calls
  `resolve_staff_by_pin`, sets the signed cookie), `DELETE` clears it
  ("Switch User"). Pairing itself needs no Route Handler: redemption is a
  plain tRPC mutation, and the *client* exchanges the returned token via
  `supabase.auth.verifyOtp()` directly — no server-side cookie write
  happens on that path, Supabase's own client manages that session.
- `requireOwnStaffId` (`floor.ts`) gains a station-aware branch: if the
  resolved Staff row's email matches the synthetic station pattern, read
  the signed cookie instead of returning the station row's own id; missing
  or expired cookie throws a distinct error code the client maps to "show
  PIN pad" rather than a generic failure.

## New UI

- `apps/web/app/station/pair/page.tsx` — unauthenticated, device-facing.
  6-digit code entry, big touch targets (matches `sign-in-form.tsx`'s OTP
  input sizing precedent). On success: client calls `verifyOtp()`, stores
  `deviceId` (non-sensitive, just an identifier) in a plain cookie,
  redirects to `/restaurants/{restaurantId}/floor`.
- Floor layout: if the signed-in identity is a station account and no
  valid PIN cookie is present, render a blocking PIN pad (reuse the OTP
  input component's styling) before any floor content. On success shows
  an "Acting as {name}" badge in the header with a "Switch User" action.
- Staff Roster: a "Floor Tablets" panel — "Pair a Floor Tablet" button
  (shows the generated code + countdown in a modal, Owner/Manager only),
  list of paired devices with `paired_at` + a "Revoke" action.

## Error handling

- Wrong/ambiguous PIN: generic "PIN not recognized" — never reveals
  whether it matched zero or multiple rows.
- Expired/already-redeemed pairing code: generic "Code not valid," same
  anti-enumeration posture as everything else in this codebase's auth
  surface.
- Revoked device: next floor-page server load finds no live station
  Staff/session state it recognizes as un-revoked → redirect to
  `/station/pair` with a "This device was removed" message.

## Testing

Unit-level coverage for: PIN collision rejection in `set_staff_pin`,
`resolve_staff_by_pin` ambiguous/no-match/success paths, cookie sign/verify
round-trip and expiry in `station-session.ts`, pairing code expiry/burn
logic. No Playwright — per `AGENTS.md`, UI is user-tested manually.
