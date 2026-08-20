# Waiter Station Account + PIN Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a shared floor tablet pair to a restaurant once (Owner/Manager-generated code), then let any named waiter unlock it for their shift with just their PIN — no per-waiter OTP sign-in on a shared device.

**Architecture:** A synthetic per-restaurant `Staff` row (`role = 'waiter'`) backed by a Supabase Auth identity is the device's persistent session (the "station"). On top of that session, a PIN check resolves to a specific named waiter's own `Staff` row and mints a short-lived, app-only signed cookie that floor mutations read for attribution — this cookie never reaches Supabase, matching architecture.md's "PIN grants no DB access."

**Tech Stack:** Drizzle + Supabase Postgres (RPCs, RLS), tRPC, Next.js Route Handlers (cookie issuance only), `jose` (already a dependency) for HMAC signing, Supabase Auth Admin API (service-role) for the station identity + magic-link device handoff.

**Spec:** `docs/superpowers/specs/2026-08-20-waiter-station-pin-login-design.md`

## Global Constraints

- Pre-launch: any change to an *existing* table/function belongs in the migration that first created it — never a new incremental migration for a change to something that already exists (`packages/db/src/schema/staff.ts`'s `set_staff_pin` collision check folds into `20260816164344_add_staff_roster_rpcs.sql`). Brand-new tables get a normal new migration.
- tRPC is the only data layer, except auth-cookie issuance — the same sanctioned exception `app/qr/[qrToken]/route.ts` already uses for the guest token.
- All permissions are server-enforced; client checks are UX only.
- PIN is attribution/audit/UI only — never a DB auth factor, never grants RLS access.
- No Playwright, no dev-server screenshots — verify with typecheck/lint/unit tests/build only (`AGENTS.md`).
- Migrations: Drizzle authors (`pnpm db:generate`), Supabase CLI applies (`pnpm db:reset`). Never `drizzle-kit migrate/push` or `supabase db diff`.
- Every hand-written `SECURITY DEFINER` function: `set search_path = ''`, schema-qualified references, `execute` revoked from `public`, granted to `authenticated`.

---

### Task 1: Drizzle schema — `station_type` enum + two new tables

**Files:**
- Modify: `packages/db/src/schema/enums.ts`
- Create: `packages/db/src/schema/station-pairing-code.ts`
- Create: `packages/db/src/schema/station-device.ts`
- Modify: `packages/db/src/schema/relations.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Produces: `stationType` enum (`"waiter"`), `stationPairingCodes` table, `stationDevices` table — Task 2's hand-written RLS/RPCs reference these table/column names exactly.

- [ ] **Step 1: Add the enum**

In `packages/db/src/schema/enums.ts`, add near `staffRole`:

```ts
// Which kind of shared device a station identity represents (docs/
// architecture.md § Station Account Provisioning). Kitchen ships later —
// this column exists now so that follow-up needs no migration of its own,
// just a new enum value.
export const stationType = pgEnum("station_type", ["waiter"]);
```

- [ ] **Step 2: Create `station-pairing-code.ts`**

```ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { stationType } from "./enums.js";
import { createdAt, id } from "./helpers.js";
import { restaurants } from "./restaurant.js";
import { staff } from "./staff.js";

// One-time device-pairing codes (docs/architecture.md § Station Account
// Provisioning). code_hash, never the plaintext code — same reasoning as
// staff.pin_hash: single-use plus a short TTL doesn't need long-term
// secrecy, but there's no reason to store it recoverable either.
export const stationPairingCodes = pgTable("station_pairing_codes", {
	id: id(),
	restaurantId: uuid("restaurant_id")
		.notNull()
		.references(() => restaurants.id, { onDelete: "cascade" }),
	stationType: stationType("station_type").notNull(),
	codeHash: text("code_hash").notNull(),
	expiresAt: timestamp("expires_at", {
		withTimezone: true,
		mode: "string",
	}).notNull(),
	redeemedAt: timestamp("redeemed_at", {
		withTimezone: true,
		mode: "string",
	}),
	createdByStaffId: uuid("created_by_staff_id")
		.notNull()
		.references(() => staff.id),
	createdAt: createdAt(),
});
```

- [ ] **Step 3: Create `station-device.ts`**

```ts
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { stationType } from "./enums.js";
import { createdAt, id } from "./helpers.js";
import { restaurants } from "./restaurant.js";

// Per-device pairing registry (docs/architecture.md § Station Account
// Provisioning, "Per-device revocation"). Doesn't store Supabase's own
// refresh token — GoTrue owns that. `revokedAt` is checked on every
// floor-page server load (apps/web/app/restaurants/[restaurantId]/floor/
// layout.tsx), not enforced instantly mid-session — see the design spec's
// Non-Goals.
export const stationDevices = pgTable("station_devices", {
	id: id(),
	restaurantId: uuid("restaurant_id")
		.notNull()
		.references(() => restaurants.id, { onDelete: "cascade" }),
	stationType: stationType("station_type").notNull(),
	createdAt: createdAt(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
});
```

- [ ] **Step 4: Wire relations and barrel export**

In `packages/db/src/schema/relations.ts`, add imports for `stationPairingCodes`/`stationDevices`, add `stationPairingCodes: many(stationPairingCodes)` and `stationDevices: many(stationDevices)` to `restaurantsRelations`, and add:

```ts
export const stationPairingCodesRelations = relations(
	stationPairingCodes,
	({ one }) => ({
		restaurant: one(restaurants, {
			fields: [stationPairingCodes.restaurantId],
			references: [restaurants.id],
		}),
	}),
);

export const stationDevicesRelations = relations(
	stationDevices,
	({ one }) => ({
		restaurant: one(restaurants, {
			fields: [stationDevices.restaurantId],
			references: [restaurants.id],
		}),
	}),
);
```

In `packages/db/src/schema/index.ts`, add two lines in alphabetical position:

```ts
export * from "./station-device.js";
export * from "./station-pairing-code.js";
```

- [ ] **Step 5: Typecheck the db package**

Run: `pnpm --filter @workspace/db typecheck`
Expected: no errors.

- [ ] **Step 6: Generate the migration**

Run: `pnpm db:generate`
Expected: one new file under `supabase/migrations/` creating `station_pairing_codes` and `station_devices`, plus a matching snapshot under `supabase/migrations/meta/`. Note its timestamp-prefixed filename — Task 2 appends to this exact file.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema supabase/migrations
git commit -m "feat(db): add station_type enum and station pairing/device tables"
```

---

### Task 2: RLS + RPCs for pairing codes and devices

**Files:**
- Modify: the migration file generated in Task 1, Step 6 (append to its end)

**Interfaces:**
- Consumes: `stationPairingCodes`/`stationDevices` tables (Task 1), `public.is_dineinly_admin()`, `public.staff_role_for_restaurant()`, `public.is_staff_manager_for_restaurant()` (all defined in `20260730150634_add_auth_fk_and_rls_policies.sql`), `extensions.crypt`/`extensions.gen_salt` (pgcrypto, already enabled by `20260816164344_add_staff_roster_rpcs.sql`).
- Produces: RPCs `generate_pairing_code(p_restaurant_id uuid, p_station_type station_type)`, `redeem_pairing_code(p_code text)`, `resolve_staff_by_pin(p_restaurant_id uuid, p_pin text)`, `revoke_station_device(p_device_id uuid)`, `list_station_devices(p_restaurant_id uuid)`, `is_station_device_revoked(p_device_id uuid)` — Task 6's `station.ts` router calls these by exact name.

- [ ] **Step 1: Enable RLS + deny-all grants, matching the existing pattern**

Append to the generated migration:

```sql
-- ============================================================================
-- Station account provisioning: pairing codes, per-device registry
-- ============================================================================
-- docs/architecture.md § Station Account Provisioning. Both tables are
-- server-only surfaces — no policy grants direct client read/write, every
-- access goes through a SECURITY DEFINER RPC below, same reasoning as
-- Staff Roster's invite/update/remove (20260816164344, § 15): the rules
-- ("only Owner/Manager may generate a code", "a code redeems exactly
-- once", "PIN lookup never reveals which rows it checked") don't reduce to
-- a single USING/WITH CHECK expression.

alter table "station_pairing_codes" enable row level security;
alter table "station_devices" enable row level security;

grant select, insert, update, delete on public.station_pairing_codes to authenticated;
grant select, insert, update, delete on public.station_devices to authenticated;

create policy "admin_all_station_pairing_codes" on public.station_pairing_codes
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());

create policy "admin_all_station_devices" on public.station_devices
	for all to authenticated
	using (public.is_dineinly_admin())
	with check (public.is_dineinly_admin());
```

- [ ] **Step 2: `generate_pairing_code`**

```sql
-- Owner/Manager mints a 6-digit, 10-minute-TTL code from Staff Roster.
-- Returns the plaintext code once — only the hash is ever stored, so this
-- is the caller's only chance to see it.
create or replace function public.generate_pairing_code(
	p_restaurant_id uuid,
	p_station_type public.station_type
)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_is_admin boolean := public.is_dineinly_admin();
	v_caller_role public.staff_role := public.staff_role_for_restaurant(p_restaurant_id);
	v_caller_staff_id uuid;
	v_code text;
	v_expires_at timestamptz := now() + interval '10 minutes';
begin
	if not v_is_admin and (v_caller_role is null or v_caller_role not in ('owner', 'manager')) then
		raise exception 'Only an active Owner or Manager may pair a station device';
	end if;

	select s.id into v_caller_staff_id
	from public.staff s
	where s.restaurant_id = p_restaurant_id and s.user_id = auth.uid() and s.status = 'active';

	if v_caller_staff_id is null then
		raise exception 'Only an active Owner or Manager may pair a station device';
	end if;

	v_code := lpad(floor(random() * 1000000)::text, 6, '0');

	insert into public.station_pairing_codes (
		restaurant_id, station_type, code_hash, expires_at, created_by_staff_id
	)
	values (
		p_restaurant_id, p_station_type, extensions.crypt(v_code, extensions.gen_salt('bf')), v_expires_at, v_caller_staff_id
	);

	return query select v_code, v_expires_at;
end;
$$;

revoke execute on function public.generate_pairing_code(uuid, public.station_type) from public;
grant execute on function public.generate_pairing_code(uuid, public.station_type) to authenticated;
```

- [ ] **Step 3: `redeem_pairing_code`**

```sql
-- Called by an unauthenticated device. Matches against unexpired,
-- unredeemed codes and burns the match — never distinguishes "wrong code"
-- from "expired" from "already used" in its response, same
-- anti-enumeration posture as resolve_staff_signin (20260730150634 § 10).
-- Does not create the station's auth.users identity — SQL can't call the
-- Auth Admin API, so apps/web/server/routers/station.ts does that step
-- right after this RPC succeeds.
create or replace function public.redeem_pairing_code(p_code text)
returns table (restaurant_id uuid, station_type public.station_type)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.station_pairing_codes;
begin
	select spc.* into v_row
	from public.station_pairing_codes spc
	where spc.redeemed_at is null
		and spc.expires_at > now()
		and spc.code_hash = extensions.crypt(p_code, spc.code_hash)
	limit 1;

	if v_row is null then
		raise exception 'Code not valid';
	end if;

	update public.station_pairing_codes
	set redeemed_at = now()
	where id = v_row.id;

	return query select v_row.restaurant_id, v_row.station_type;
end;
$$;

revoke execute on function public.redeem_pairing_code(text) from public;
grant execute on function public.redeem_pairing_code(text) to authenticated, anon;
```

- [ ] **Step 4: `resolve_staff_by_pin`**

```sql
-- Called from an already-paired station's own session (caller must already
-- hold an active Staff row at p_restaurant_id) to identify which named
-- waiter is now acting on the device. Never returns pin_hash, never
-- distinguishes "no match" from "ambiguous match" — both raise the same
-- generic error, same posture as every other auth check in this codebase.
-- Excludes the station's own row implicitly: a station account never has
-- pin_hash set (nothing sets one for it), so crypt() against a null
-- pin_hash never matches.
create or replace function public.resolve_staff_by_pin(
	p_restaurant_id uuid,
	p_pin text
)
returns table (staff_id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_caller_active boolean;
	v_match record;
	v_match_count int;
begin
	select exists (
		select 1 from public.staff s
		where s.restaurant_id = p_restaurant_id and s.user_id = auth.uid() and s.status = 'active'
	) into v_caller_active;

	if not v_caller_active then
		raise exception 'PIN not recognized';
	end if;

	select count(*) into v_match_count
	from public.staff s
	where s.restaurant_id = p_restaurant_id
		and s.role = 'waiter'
		and s.status = 'active'
		and s.pin_hash is not null
		and s.pin_hash = extensions.crypt(p_pin, s.pin_hash);

	if v_match_count <> 1 then
		raise exception 'PIN not recognized';
	end if;

	select s.id, s.name into v_match
	from public.staff s
	where s.restaurant_id = p_restaurant_id
		and s.role = 'waiter'
		and s.status = 'active'
		and s.pin_hash is not null
		and s.pin_hash = extensions.crypt(p_pin, s.pin_hash);

	return query select v_match.id, v_match.name;
end;
$$;

revoke execute on function public.resolve_staff_by_pin(uuid, text) from public;
grant execute on function public.resolve_staff_by_pin(uuid, text) to authenticated;
```

- [ ] **Step 5: `revoke_station_device` and `list_station_devices`**

```sql
create or replace function public.revoke_station_device(p_device_id uuid)
returns table (id uuid, revoked_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_is_admin boolean := public.is_dineinly_admin();
	v_device public.station_devices;
	v_caller_role public.staff_role;
begin
	select * into v_device from public.station_devices where station_devices.id = p_device_id;
	if v_device is null then
		raise exception 'Device not found';
	end if;

	v_caller_role := public.staff_role_for_restaurant(v_device.restaurant_id);
	if not v_is_admin and (v_caller_role is null or v_caller_role not in ('owner', 'manager')) then
		raise exception 'Only an active Owner or Manager may revoke a station device';
	end if;

	return query
		update public.station_devices
		set revoked_at = now()
		where station_devices.id = p_device_id
		returning station_devices.id, station_devices.revoked_at;
end;
$$;

revoke execute on function public.revoke_station_device(uuid) from public;
grant execute on function public.revoke_station_device(uuid) to authenticated;

create or replace function public.list_station_devices(p_restaurant_id uuid)
returns table (id uuid, station_type public.station_type, created_at timestamptz, revoked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
	select sd.id, sd.station_type, sd.created_at, sd.revoked_at
	from public.station_devices sd
	where sd.restaurant_id = p_restaurant_id
		and public.is_staff_manager_for_restaurant(p_restaurant_id)
	order by sd.created_at desc;
$$;

revoke execute on function public.list_station_devices(uuid) from public;
grant execute on function public.list_station_devices(uuid) to authenticated;
```

- [ ] **Step 6: `is_station_device_revoked`**

Backs the Floor page's revocation check (Task 11) — the device itself
carries a plain, non-sensitive id cookie (Task 10), and this tells the
Floor page whether that specific device was revoked. Low-stakes by design:
revocation here is a courtesy redirect, not the security boundary — the
real one is the Supabase station session and the PIN check, neither of
which this bypasses.

```sql
create or replace function public.is_station_device_revoked(p_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(
			select sd.revoked_at is not null
			from public.station_devices sd
			where sd.id = p_device_id
				and public.is_active_staff_for_restaurant(sd.restaurant_id)
		),
		false
	);
$$;

revoke execute on function public.is_station_device_revoked(uuid) from public;
grant execute on function public.is_station_device_revoked(uuid) to authenticated;
```

- [ ] **Step 7: Reset the local DB and confirm it applies cleanly**

Run: `pnpm db:reset`
Expected: all migrations replay with no errors, `seed.sql` runs after.

- [ ] **Step 8: Regenerate types and confirm no drift**

Run: `pnpm db:types`
Then: `pnpm db:generate`
Expected: `db:generate` produces **no new file** — proves `schema.ts` and the applied DB agree.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations packages/db/src/database.types.ts
git commit -m "feat(db): add station pairing/PIN RPCs and RLS"
```

---

### Task 3: Fold PIN collision check into `set_staff_pin`

**Files:**
- Modify: `supabase/migrations/20260816164344_add_staff_roster_rpcs.sql` (the existing `set_staff_pin` function body, § 15b)

**Interfaces:**
- Consumes: nothing new.
- Produces: `set_staff_pin` now rejects a PIN that collides with another active `waiter`/`kitchen` row at the same restaurant — Task 6's `resolve_staff_by_pin` depends on this uniqueness to ever return an unambiguous match.

- [ ] **Step 1: Replace the function body**

Find `create or replace function public.set_staff_pin` in
`supabase/migrations/20260816164344_add_staff_roster_rpcs.sql` and replace its
body (the whole `as $$ ... $$;` block) with:

```sql
create or replace function public.set_staff_pin(
	p_restaurant_id uuid,
	p_pin text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_updated int;
	v_collision boolean;
begin
	if p_pin !~ '^[0-9]{4,6}$' then
		raise exception 'PIN must be 4 to 6 digits';
	end if;

	-- pin_hash is salted bcrypt, so this can't be a DB unique index — a PIN
	-- must resolve to exactly one person on a shared device
	-- (resolve_staff_by_pin), so check for a collision the app-level way:
	-- compare the candidate against every other active waiter/kitchen row's
	-- hash. Restaurant staff counts are small, so this stays cheap.
	select exists (
		select 1
		from public.staff s
		where s.restaurant_id = p_restaurant_id
			and s.role in ('waiter', 'kitchen')
			and s.status = 'active'
			and s.user_id is distinct from auth.uid()
			and s.pin_hash is not null
			and s.pin_hash = extensions.crypt(p_pin, s.pin_hash)
	) into v_collision;

	if v_collision then
		raise exception 'That PIN is already in use at this restaurant — choose a different one';
	end if;

	update public.staff
	set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), updated_at = now()
	where restaurant_id = p_restaurant_id
		and user_id = auth.uid()
		and status = 'active';

	get diagnostics v_updated = row_count;
	if v_updated = 0 then
		raise exception 'No active staff row found for this restaurant';
	end if;
end;
$$;
```

Leave the `revoke`/`grant` lines immediately below it unchanged.

- [ ] **Step 2: Update the comment above § 15b**

The block comment above `-- 15b. Staff PIN: self-service set/change` currently
says PIN station login is fully deferred. Update its last sentence to:

```sql
-- Kiosk-mode redemption (Task 5, apps/web/server/routers/station.ts) now
-- depends on the PIN uniqueness this function enforces.
```

- [ ] **Step 3: Reset and confirm no incremental migration is needed**

Run: `pnpm db:reset`
Then: `pnpm db:generate`
Expected: reset succeeds; `db:generate` produces no new file (this was a
hand-edit to an existing function body, not a schema.ts change — nothing for
Drizzle to diff).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260816164344_add_staff_roster_rpcs.sql
git commit -m "fix(db): reject colliding PINs in set_staff_pin"
```

---

### Task 4: `station-session.ts` — signed "acting staff" cookie

**Files:**
- Create: `apps/web/lib/station-session.ts`
- Test: `apps/web/tests/lib/station-session.test.ts`
- Modify: `apps/web/lib/env.ts`

**Interfaces:**
- Produces: `mintStationSessionToken({ staffId, restaurantId }): Promise<string>`, `verifyStationSessionToken(token: string): Promise<{ staffId: string; restaurantId: string } | null>`, `STATION_SESSION_COOKIE` (cookie name), `STATION_SESSION_TTL_SECONDS` (constant, 12h), `STATION_DEVICE_ID_COOKIE` (plain, unsigned cookie name) — Task 7 (Route Handler), Task 8 (`requireOwnStaffId`/context), and Task 10 (`/station/pair`) import these by exact name.

- [ ] **Step 1: Add the env var**

In `apps/web/lib/env.ts`, add to the `server` block:

```ts
// HMAC secret for the "acting staff" PIN-unlock cookie
// (lib/station-session.ts). Deliberately not the guest-token RS256
// signing key: this cookie never reaches Supabase as a bearer credential
// (architecture.md: PIN grants "no DB access"), so a symmetric app-only
// secret is the right-sized mechanism — no JWK, no Supabase-trusted key.
STATION_PIN_SECRET: z.string().min(32),
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/tests/lib/station-session.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	mintStationSessionToken,
	verifyStationSessionToken,
} from "@/lib/station-session";

const claims = {
	staffId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
	restaurantId: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
};

afterEach(() => {
	vi.useRealTimers();
});

describe("station-session", () => {
	it("round-trips: mint then verify returns the same claims", async () => {
		const token = await mintStationSessionToken(claims);
		expect(await verifyStationSessionToken(token)).toEqual(claims);
	});

	it("rejects a token past its 12h expiry", async () => {
		const token = await mintStationSessionToken(claims);
		vi.useFakeTimers();
		vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
		expect(await verifyStationSessionToken(token)).toBeNull();
	});

	it("rejects a tampered signature", async () => {
		const token = await mintStationSessionToken(claims);
		const parts = token.split(".");
		const tampered = `${parts[0]}.${parts[1]}.${parts[2]?.split("").reverse().join("")}`;
		expect(await verifyStationSessionToken(tampered)).toBeNull();
	});

	it("rejects garbage input", async () => {
		expect(await verifyStationSessionToken("not.a.jwt")).toBeNull();
	});
});
```

- [ ] **Step 3: Run test, confirm it fails**

Run: `pnpm --filter web test station-session -- --run`
Expected: FAIL — `@/lib/station-session` doesn't exist yet.

- [ ] **Step 4: Implement**

```ts
// apps/web/lib/station-session.ts
import * as jose from "jose";
import { z } from "zod";
import { env } from "./env";

// "Acting as {waiter}" cookie for a paired station device (docs/
// architecture.md § Station Account Provisioning). This is deliberately
// not lib/guest-token.ts's pattern: that RS256 key exists so Supabase
// itself trusts the token as a Postgres role claim. This cookie never
// reaches Supabase — PIN grants no DB access — so a plain HMAC over an
// app-only secret is the right-sized mechanism.
const STATION_SESSION_ALG = "HS256";
export const STATION_SESSION_COOKIE = "dineinly_station_session";
/** Flat 12h expiry, no sliding refresh — matches the existing
 *  GUEST_TOKEN_MIN_TTL_SECONDS convention. Also the cookie's max-age. */
export const STATION_SESSION_TTL_SECONDS = 12 * 60 * 60;

// Plain (unsigned, client-writable) — just an identifier, not a
// credential. Set once by /station/pair after a successful pairing, read
// back by the Floor page to ask is_station_device_revoked() about this
// specific device. Revocation here is a courtesy redirect, not a security
// boundary, so it doesn't need signing — the real boundary is the
// Supabase station session plus the PIN check, neither of which a forged
// device id can bypass.
export const STATION_DEVICE_ID_COOKIE = "dineinly_station_device_id";

const stationClaimsSchema = z.object({
	staffId: z.uuid(),
	restaurantId: z.uuid(),
});

export type StationSessionClaims = z.infer<typeof stationClaimsSchema>;

let cachedKey: Promise<jose.CryptoKey> | undefined;

function secretKey(): Promise<jose.CryptoKey> {
	cachedKey ??= jose.importJWK(
		{ kty: "oct", k: Buffer.from(env.STATION_PIN_SECRET).toString("base64url") },
		STATION_SESSION_ALG,
	) as Promise<jose.CryptoKey>;
	return cachedKey;
}

/** Mints the signed "acting staff" token. Caller sets it as an httpOnly cookie. */
export async function mintStationSessionToken(
	claims: StationSessionClaims,
): Promise<string> {
	const key = await secretKey();
	return new jose.SignJWT({ ...claims })
		.setProtectedHeader({ alg: STATION_SESSION_ALG })
		.setIssuedAt()
		.setExpirationTime(`${STATION_SESSION_TTL_SECONDS}s`)
		.sign(key);
}

/** Verifies signature + expiry and returns the typed claims, or null. */
export async function verifyStationSessionToken(
	token: string,
): Promise<StationSessionClaims | null> {
	try {
		const key = await secretKey();
		const { payload } = await jose.jwtVerify(token, key, {
			algorithms: [STATION_SESSION_ALG],
		});
		return stationClaimsSchema.parse(payload);
	} catch {
		return null;
	}
}
```

- [ ] **Step 5: Run test, confirm it passes**

Run: `pnpm --filter web test station-session -- --run`
Expected: PASS, 4/4.

Note: the test run needs `STATION_PIN_SECRET` set — check
`apps/web/vitest.config.ts` / `apps/web/tests/setup.ts` (or wherever
`GUEST_JWT_SIGNING_KEY` is provided for `guest-token.test.ts`) and add a
32+ character dummy value the same way.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/station-session.ts apps/web/tests/lib/station-session.test.ts apps/web/lib/env.ts
git commit -m "feat: add signed acting-staff session cookie helper"
```

---

### Task 5: `station.schema.ts` — input validation

**Files:**
- Create: `apps/web/server/routers/station.schema.ts`
- Test: `apps/web/tests/server/routers/station.schema.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `pairingCodePattern` (regex), `generatePairingCodeInput`, `redeemPairingCodeInput`, `verifyPinInput`, `revokeDeviceInput`, `listDevicesInput` — Task 6's router imports every one of these by name.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/server/routers/station.schema.test.ts
import { describe, expect, it } from "vitest";
import {
	redeemPairingCodeInput,
	verifyPinInput,
} from "@/server/routers/station.schema";

describe("station.schema", () => {
	it("accepts a 6-digit pairing code", () => {
		expect(redeemPairingCodeInput.parse({ code: "123456" })).toEqual({
			code: "123456",
		});
	});

	it("rejects a pairing code that isn't 6 digits", () => {
		expect(() => redeemPairingCodeInput.parse({ code: "12345" })).toThrow();
	});

	it("accepts a 4-to-6-digit PIN", () => {
		expect(
			verifyPinInput.parse({
				restaurantId: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
				pin: "4242",
			}),
		).toEqual({
			restaurantId: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
			pin: "4242",
		});
	});

	it("rejects a non-numeric PIN", () => {
		expect(() =>
			verifyPinInput.parse({
				restaurantId: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
				pin: "abcd",
			}),
		).toThrow();
	});
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `pnpm --filter web test station.schema -- --run`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// apps/web/server/routers/station.schema.ts
import { z } from "zod";
import { PIN_PATTERN } from "./staff.schema";

const restaurantIdSchema = z.string().uuid();

export const pairingCodePattern = /^\d{6}$/;

export const stationTypeSchema = z.enum(["waiter"]);

export const generatePairingCodeInput = z.object({
	restaurantId: restaurantIdSchema,
	stationType: stationTypeSchema,
});

export const redeemPairingCodeInput = z.object({
	code: z.string().trim().regex(pairingCodePattern, "Code must be 6 digits"),
});

// Shared with the PIN pad component so both validate identically off one
// pattern — same relationship staff.schema.ts's PIN_PATTERN has with
// profile-sheet.tsx.
export const verifyPinInput = z.object({
	restaurantId: restaurantIdSchema,
	pin: z.string().trim().regex(PIN_PATTERN, "PIN must be 4 to 6 digits"),
});

export const revokeDeviceInput = z.object({
	deviceId: z.string().uuid(),
});

export const listDevicesInput = z.object({
	restaurantId: restaurantIdSchema,
});
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `pnpm --filter web test station.schema -- --run`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/routers/station.schema.ts apps/web/tests/server/routers/station.schema.test.ts
git commit -m "feat: add station router input schemas"
```

---

### Task 6: `station.ts` router

**Files:**
- Create: `apps/web/server/routers/station.ts`
- Modify: `apps/web/server/routers/_app.ts`

**Interfaces:**
- Consumes: `generatePairingCodeInput`/`redeemPairingCodeInput`/`revokeDeviceInput`/`listDevicesInput` (Task 5), `createAdminClient` (`lib/supabase/admin.ts`), `requireStaffRole` (`server/trpc/rbac.ts`), `authedProcedure`/`publicProcedure`/`router` (`server/trpc/init.ts`), RPCs from Task 2.
- Produces: `stationRouter` with `generatePairingCode`, `redeemPairingCode`, `revokeDevice`, `listDevices` — Task 9 (Staff Roster panel) and Task 11 (`/station/pair` page) call these via `trpc.station.*`.

- [ ] **Step 1: Implement the router**

```ts
// apps/web/server/routers/station.ts
import { TRPCError } from "@trpc/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authedProcedure, publicProcedure, router } from "../trpc/init";
import { requireStaffRole } from "../trpc/rbac";
import {
	generatePairingCodeInput,
	listDevicesInput,
	redeemPairingCodeInput,
	revokeDeviceInput,
} from "./station.schema";

function dbError(message: string, cause: unknown): TRPCError {
	return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause });
}

// Synthetic identity per restaurant per station type (docs/architecture.md
// § Station Account Provisioning) — unroutable, exists only to satisfy
// Supabase Auth's unique-email requirement. Nothing is ever sent to it.
function stationEmail(restaurantId: string, stationType: "waiter"): string {
	return `${stationType}-${restaurantId}@stations.dineinly.internal`;
}

export const stationRouter = router({
	// Owner/Manager, from Staff Roster. Returns the plaintext code once —
	// only its hash is ever persisted (generate_pairing_code, supabase/
	// migrations).
	generatePairingCode: authedProcedure
		.input(generatePairingCodeInput)
		.mutation(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			const { data, error } = await ctx.auth.rpc("generate_pairing_code", {
				p_restaurant_id: input.restaurantId,
				p_station_type: input.stationType,
			});
			if (error || !data?.[0]) {
				throw dbError("Unable to generate a pairing code.", error);
			}
			return { code: data[0].code, expiresAt: data[0].expires_at };
		}),

	// Called by an unauthenticated device from /station/pair. Burns the
	// code, lazily provisions the station's auth.users + Staff row on this
	// restaurant's first-ever pairing (idempotent on the synthetic email),
	// then mints a magic-link token the *client* exchanges itself via
	// supabase.auth.verifyOtp() — this server never touches a station
	// password.
	redeemPairingCode: publicProcedure
		.input(redeemPairingCodeInput)
		.mutation(async ({ ctx, input }) => {
			const { data: redeemed, error: redeemError } = await ctx.supabase.rpc(
				"redeem_pairing_code",
				{ p_code: input.code },
			);
			if (redeemError || !redeemed?.[0]) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Code not valid.",
					cause: redeemError,
				});
			}
			const { restaurant_id: restaurantId, station_type: stationType } =
				redeemed[0];

			const adminClient = createAdminClient();
			const email = stationEmail(restaurantId, stationType);

			const existing = await adminClient.auth.admin.listUsers({
				page: 1,
				perPage: 1,
				// @ts-expect-error -- filter isn't in the SDK's listUsers types but
				// GoTrue accepts it; narrows to an exact-email lookup instead of
				// paging every user in the project.
				filter: `email.eq."${email}"`,
			});
			let userId = existing.data?.users[0]?.id;

			if (!userId) {
				const { data: created, error: createError } =
					await adminClient.auth.admin.createUser({
						email,
						email_confirm: true,
					});
				if (createError || !created.user) {
					throw dbError("Unable to provision the station device.", createError);
				}
				userId = created.user.id;

				const { error: staffError } = await adminClient.from("staff").insert({
					restaurant_id: restaurantId,
					user_id: userId,
					email,
					role: stationType,
					status: "active",
				});
				if (staffError) {
					throw dbError("Unable to provision the station device.", staffError);
				}
			}

			const { data: link, error: linkError } =
				await adminClient.auth.admin.generateLink({
					type: "magiclink",
					email,
				});
			if (linkError || !link) {
				throw dbError("Unable to pair this device.", linkError);
			}

			const { data: device, error: deviceError } = await adminClient
				.from("station_devices")
				.insert({ restaurant_id: restaurantId, station_type: stationType })
				.select("id")
				.single();
			if (deviceError || !device) {
				throw dbError("Unable to pair this device.", deviceError);
			}

			return {
				email,
				tokenHash: link.properties.hashed_token,
				restaurantId,
				deviceId: device.id,
			};
		}),

	revokeDevice: authedProcedure
		.input(revokeDeviceInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("revoke_station_device", {
				p_device_id: input.deviceId,
			});
			if (error || !data?.[0]) {
				throw dbError("Unable to revoke that device.", error);
			}
			return { id: data[0].id, revokedAt: data[0].revoked_at };
		}),

	listDevices: authedProcedure
		.input(listDevicesInput)
		.query(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			const { data, error } = await ctx.auth.rpc("list_station_devices", {
				p_restaurant_id: input.restaurantId,
			});
			if (error) {
				throw dbError("Unable to load paired devices.", error);
			}
			return (data ?? []).map((row) => ({
				id: row.id,
				stationType: row.station_type,
				createdAt: row.created_at,
				revokedAt: row.revoked_at,
			}));
		}),
});
```

- [ ] **Step 2: Register the router**

In `apps/web/server/routers/_app.ts`, add the import alongside the others
(alphabetical) and the `station: stationRouter,` entry alongside `staff:
staffRouter,`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors. If `auth.admin.listUsers`'s `filter` option genuinely
isn't typed, the `@ts-expect-error` above should make this pass — if
typecheck instead reports an *unused* `@ts-expect-error` (meaning the SDK
does type it), delete that comment line.

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/routers/station.ts apps/web/server/routers/_app.ts
git commit -m "feat: add station router (pairing, PIN-adjacent device management)"
```

---

### Task 7: Route Handler — PIN verify/clear cookie

**Files:**
- Create: `apps/web/app/station/pin/route.ts`

**Interfaces:**
- Consumes: `verifyPinInput` (Task 5), `mintStationSessionToken`/`STATION_SESSION_COOKIE`/`STATION_SESSION_TTL_SECONDS` (Task 4), `createClient` (`lib/supabase/server.ts`).
- Produces: `POST /station/pin` (sets the cookie on a valid PIN), `DELETE /station/pin` (clears it — "Switch User") — Task 10's PIN pad and "Switch User" button call these directly with `fetch`.

- [ ] **Step 1: Implement**

```ts
// apps/web/app/station/pin/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
	mintStationSessionToken,
	STATION_SESSION_COOKIE,
	STATION_SESSION_TTL_SECONDS,
} from "@/lib/station-session";
import { createClient } from "@/lib/supabase/server";
import { verifyPinInput } from "@/server/routers/station.schema";

// Auth-cookie issuance, not CRUD — same sanctioned exception to "tRPC
// only" that app/qr/[qrToken]/route.ts already uses for the guest token.
// A Route Handler is required here (not a tRPC mutation) because only a
// Route Handler/Server Component can write a response cookie — see
// apps/web/server/trpc/context.ts's comment on why tRPC context can't.
export async function POST(request: Request) {
	const body = verifyPinInput.safeParse(await request.json());
	if (!body.success) {
		return NextResponse.json({ error: "Invalid request." }, { status: 400 });
	}

	const supabase = await createClient();
	const { data, error } = await supabase.rpc("resolve_staff_by_pin", {
		p_restaurant_id: body.data.restaurantId,
		p_pin: body.data.pin,
	});

	if (error || !data?.[0]) {
		return NextResponse.json({ error: "PIN not recognized." }, { status: 401 });
	}

	const token = await mintStationSessionToken({
		staffId: data[0].staff_id,
		restaurantId: body.data.restaurantId,
	});

	const response = NextResponse.json({ name: data[0].name });
	response.cookies.set(STATION_SESSION_COOKIE, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: STATION_SESSION_TTL_SECONDS,
		path: "/",
	});
	return response;
}

// "Switch User" — clears the acting-staff cookie without touching the
// underlying Supabase station session, so the device stays paired.
export async function DELETE() {
	const cookieStore = await cookies();
	cookieStore.delete(STATION_SESSION_COOKIE);
	return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/station/pin/route.ts
git commit -m "feat: add PIN verify/clear route handler"
```

---

### Task 8: Station-aware attribution in `floor.ts`

**Files:**
- Modify: `apps/web/server/trpc/context.ts`
- Modify: `apps/web/server/routers/floor.ts:28-52` (`requireOwnStaffId`)

**Interfaces:**
- Consumes: `STATION_SESSION_COOKIE`/`verifyStationSessionToken` (Task 4).
- Produces: `ctx.stationSession: { staffId: string; restaurantId: string } | null` and `ctx.stationDeviceId: string | null` on `Context` — any future station-aware procedure (Task 11's `myStationStatus`) reads these the same way `floor.ts` does.

- [ ] **Step 1: Read both cookies into context**

In `apps/web/server/trpc/context.ts`, alongside the existing
`GUEST_TOKEN_COOKIE` read, add:

```ts
import {
	STATION_DEVICE_ID_COOKIE,
	STATION_SESSION_COOKIE,
	verifyStationSessionToken,
} from "@/lib/station-session";
```

and inside `createContext()`, after the guest token block:

```ts
const stationSessionToken = cookieStore.get(STATION_SESSION_COOKIE)?.value;
const stationSession = stationSessionToken
	? await verifyStationSessionToken(stationSessionToken)
	: null;

// Plain, unsigned — just an identifier for is_station_device_revoked(),
// not a credential. See lib/station-session.ts's comment on why this one
// doesn't need signing.
const stationDeviceId = cookieStore.get(STATION_DEVICE_ID_COOKIE)?.value ?? null;
```

then add `stationSession,` and `stationDeviceId,` to the returned object.

- [ ] **Step 2: Branch `requireOwnStaffId` on the station identity**

In `apps/web/server/routers/floor.ts`, the synthetic-email pattern is the
station marker (Task 6's `stationEmail`) — inline it here too rather than
importing from `station.ts`, since `floor.ts` only needs the suffix check,
not the full router. Replace the function body:

```ts
const STATION_EMAIL_SUFFIX = "@stations.dineinly.internal";

async function requireOwnStaffId(
	ctx: Context,
	restaurantId: string,
): Promise<string> {
	const {
		data: { user },
	} = await ctx.auth.auth.getUser();

	const staffResult = await ctx.auth
		.from("staff")
		.select("id, email")
		.eq("restaurant_id", restaurantId)
		.eq("user_id", user?.id ?? "")
		.eq("status", "active")
		.in("role", FLOOR_ROLES)
		.maybeSingle();
	if (staffResult.error) {
		throw dbError("Unable to identify staff member.", staffResult.error);
	}
	if (!staffResult.data) {
		// Dineinly Admin has no Staff row — orders_placed_by_staff_id_check
		// requires one for placed_by_type = 'staff', so Admin can't place an
		// order on a restaurant's behalf the same way Waiter/Manager/Owner do.
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"Only an active Waiter, Manager, or Owner may order for a guest.",
		});
	}

	if (!staffResult.data.email.endsWith(STATION_EMAIL_SUFFIX)) {
		return staffResult.data.id;
	}

	// A shared station device's own Staff row is never the actor — the PIN-
	// resolved "acting" waiter is (docs/architecture.md § Station Account
	// Provisioning: PIN grants no DB access, attribution only). No valid
	// PIN cookie means nobody has unlocked this device yet.
	if (!ctx.stationSession || ctx.stationSession.restaurantId !== restaurantId) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Enter your PIN to continue.",
		});
	}
	return ctx.stationSession.staffId;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/trpc/context.ts apps/web/server/routers/floor.ts
git commit -m "feat: resolve floor attribution from PIN session on station devices"
```

---

### Task 9: Staff Roster — "Floor Tablets" panel

**Files:**
- Create: `apps/web/app/restaurants/[restaurantId]/staff/station-panel.tsx`
- Modify: `apps/web/app/restaurants/[restaurantId]/staff/page.tsx`

**Interfaces:**
- Consumes: `trpc.station.generatePairingCode`, `trpc.station.listDevices`, `trpc.station.revokeDevice` (Task 6), `useIsAdmin`/`useRestaurantRole` (`../viewer-context`, already used by `staff/page.tsx`).
- Produces: `<StationPanel restaurantId={string} />` — mounted from `staff/page.tsx`, no other task depends on its exports.

- [ ] **Step 1: Implement the panel**

```tsx
// apps/web/app/restaurants/[restaurantId]/staff/station-panel.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";

// Owner/Manager only (staff/page.tsx only mounts this for them). Pairing a
// device and revoking one are the two device-level actions from docs/
// architecture.md § Station Account Provisioning; PIN issuance itself
// stays self-service (profile-sheet.tsx), unchanged by this panel.
export function StationPanel({ restaurantId }: { restaurantId: string }) {
	const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(
		null,
	);
	const utils = trpc.useUtils();
	const devicesQuery = trpc.station.listDevices.useQuery({ restaurantId });
	const generateMutation = trpc.station.generatePairingCode.useMutation({
		onSuccess: (data) => setPairing(data),
	});
	const revokeMutation = trpc.station.revokeDevice.useMutation({
		onSuccess: () => utils.station.listDevices.invalidate({ restaurantId }),
	});

	const devices = (devicesQuery.data ?? []).filter((d) => !d.revokedAt);

	return (
		<section className="mt-10 rounded-xl border border-divider bg-surface p-6">
			<div className="flex items-center justify-between">
				<h2 className="text-caps text-muted">Floor Tablets</h2>
				<button
					type="button"
					onClick={() =>
						generateMutation.mutate({ restaurantId, stationType: "waiter" })
					}
					disabled={generateMutation.isPending}
					className="rounded-md bg-accent px-4 py-2 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{generateMutation.isPending ? "Generating…" : "Pair a Floor Tablet"}
				</button>
			</div>

			{pairing ? (
				<div className="mt-4 rounded-md border border-divider bg-surface-elevated p-4 text-center">
					<p className="text-secondary text-sm">
						Enter this code on the tablet at{" "}
						<span className="text-primary">/station/pair</span>:
					</p>
					<p className="mt-2 font-medium text-3xl text-primary tracking-widest">
						{pairing.code}
					</p>
					<p className="mt-1 text-muted text-xs">Expires at {pairing.expiresAt}</p>
					<button
						type="button"
						onClick={() => setPairing(null)}
						className="mt-3 text-secondary text-sm hover:text-primary"
					>
						Dismiss
					</button>
				</div>
			) : null}

			<ul className="mt-4 divide-y divide-divider">
				{devices.length === 0 ? (
					<li className="py-3 text-muted text-sm">No floor tablets paired yet.</li>
				) : (
					devices.map((device) => (
						<li key={device.id} className="flex items-center justify-between py-3">
							<span className="text-primary text-sm">
								Paired {new Date(device.createdAt).toLocaleString()}
							</span>
							<button
								type="button"
								onClick={() => revokeMutation.mutate({ deviceId: device.id })}
								disabled={revokeMutation.isPending}
								className="text-error text-sm hover:opacity-80 disabled:cursor-not-allowed"
							>
								Revoke
							</button>
						</li>
					))
				)}
			</ul>
		</section>
	);
}
```

- [ ] **Step 2: Mount it from `staff/page.tsx`**

In `apps/web/app/restaurants/[restaurantId]/staff/page.tsx`, import
`StationPanel` and `useIsAdmin`/`useRestaurantRole` (the latter already
imported). After the existing staff list section, add:

```tsx
{isAdmin || restaurantRole === "owner" || restaurantRole === "manager" ? (
	<StationPanel restaurantId={restaurantId} />
) : null}
```

using whatever the file's existing `isAdmin`/`restaurantRole` local variable
names already are (`useIsAdmin()`/`useRestaurantRole()`, already imported at
the top of the file per its current imports).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/restaurants/[restaurantId]/staff/station-panel.tsx apps/web/app/restaurants/[restaurantId]/staff/page.tsx
git commit -m "feat: add Floor Tablets pairing panel to Staff Roster"
```

---

### Task 10: `/station/pair` page

**Files:**
- Create: `apps/web/app/station/pair/page.tsx`

**Interfaces:**
- Consumes: `trpc.station.redeemPairingCode` (Task 6), `createClient` (`lib/supabase/client.ts`), `pairingCodePattern` (Task 5), `STATION_DEVICE_ID_COOKIE` (Task 4), `Field` (`components/form-sheet.tsx`), `BrandLogo` (`components/brand-logo.tsx`).
- Produces: nothing consumed elsewhere — this is a leaf page.

- [ ] **Step 1: Implement**

```tsx
// apps/web/app/station/pair/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Field } from "@/components/form-sheet";
import { STATION_DEVICE_ID_COOKIE } from "@/lib/station-session";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import { pairingCodePattern } from "@/server/routers/station.schema";

// Unauthenticated, device-facing (docs/architecture.md § Station Account
// Provisioning, step 2: "no password is ever typed on the device"). Lives
// outside the four route trees in AGENTS.md on purpose — this
// authenticates a device, not a viewer, so it's neither /sign-in nor
// under app/restaurants/[restaurantId], whose layout would redirect an
// unpaired device before it ever reaches this form.
export default function StationPairPage() {
	const router = useRouter();
	const supabase = createClient();
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const redeemMutation = trpc.station.redeemPairingCode.useMutation();

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!pairingCodePattern.test(code)) {
			setError("Enter the 6-digit code.");
			return;
		}
		setError(null);

		try {
			const { email, tokenHash, restaurantId, deviceId } =
				await redeemMutation.mutateAsync({ code });
			const { error: verifyError } = await supabase.auth.verifyOtp({
				email,
				token: tokenHash,
				type: "magiclink",
			});
			if (verifyError) {
				setError("Couldn't finish pairing this device.");
				return;
			}
			// One year, path=/ — outlives the Supabase session by design; if the
			// station ever re-pairs, a fresh redemption overwrites this with the
			// new device's id.
			document.cookie = `${STATION_DEVICE_ID_COOKIE}=${deviceId}; path=/; max-age=${60 * 60 * 24 * 365}`;
			router.replace(`/restaurants/${restaurantId}/floor`);
		} catch (mutationError) {
			setError(
				mutationError instanceof Error
					? mutationError.message
					: "Code not valid.",
			);
		}
	}

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16">
			<BrandLogo height={40} priority />

			<div className="w-full max-w-sm rounded-xl border border-divider bg-surface p-6">
				<div className="mb-6 text-center">
					<h1 className="text-lg text-primary">Pair this device</h1>
					<p className="mt-1 text-secondary text-sm">
						Enter the 6-digit code shown on the Manager's screen.
					</p>
				</div>

				<form className="space-y-6" onSubmit={handleSubmit} noValidate>
					<Field label="Pairing code" error={error ?? undefined}>
						<input
							inputMode="numeric"
							autoComplete="off"
							maxLength={6}
							placeholder="000000"
							value={code}
							disabled={redeemMutation.isPending}
							onChange={(event) =>
								setCode(event.target.value.replace(/\D/g, ""))
							}
						/>
					</Field>

					<button
						type="submit"
						disabled={redeemMutation.isPending}
						aria-busy={redeemMutation.isPending}
						className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
					>
						{redeemMutation.isPending ? "Pairing…" : "Pair Device"}
					</button>
				</form>
			</div>
		</main>
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/station/pair/page.tsx
git commit -m "feat: add station device pairing page"
```

---

### Task 11: Floor PIN gate + "Acting as" badge

**Files:**
- Modify: `apps/web/app/restaurants/[restaurantId]/floor/page.tsx`
- Modify: `apps/web/server/routers/station.ts` (add one query procedure)

**Interfaces:**
- Consumes: `verifyPinInput` shape for the POST body, `STATION_SESSION_COOKIE`-gated `requireOwnStaffId` behavior (Task 8), `ctx.stationDeviceId` and `is_station_device_revoked` (Task 8/Task 2 Step 6) — this task is what actually triggers `requireOwnStaffId`'s `PRECONDITION_FAILED` error and reacts to it.
- Produces: `trpc.station.myStationStatus` query — `{ isStation: boolean; actingStaffName: string | null; deviceRevoked: boolean }`, used only by this page.

- [ ] **Step 1: Add the status query to `station.ts`**

Append to `stationRouter` in `apps/web/server/routers/station.ts`:

```ts
	// Tells the Floor page whether the signed-in identity is a shared
	// station device (in which case it needs a PIN pad), whether *this*
	// device was revoked (in which case it needs to bounce back to
	// /station/pair instead), and, if a PIN session cookie is already
	// present, who's acting.
	myStationStatus: authedProcedure.query(async ({ ctx }) => {
		const {
			data: { user },
		} = await ctx.auth.auth.getUser();

		const { data: staffRow } = await ctx.auth
			.from("staff")
			.select("email")
			.eq("user_id", user?.id ?? "")
			.eq("status", "active")
			.like("email", "%@stations.dineinly.internal")
			.maybeSingle();

		const isStation = staffRow != null;
		if (!isStation) {
			return { isStation, actingStaffName: null, deviceRevoked: false };
		}

		let deviceRevoked = false;
		if (ctx.stationDeviceId) {
			const { data: revoked } = await ctx.auth.rpc(
				"is_station_device_revoked",
				{ p_device_id: ctx.stationDeviceId },
			);
			deviceRevoked = revoked ?? false;
		}
		if (deviceRevoked || !ctx.stationSession) {
			return { isStation, actingStaffName: null, deviceRevoked };
		}

		const { data: named } = await ctx.auth
			.from("staff")
			.select("name")
			.eq("id", ctx.stationSession.staffId)
			.maybeSingle();

		return { isStation, actingStaffName: named?.name ?? null, deviceRevoked };
	}),
```

- [ ] **Step 2: Gate the Floor page on it**

In `apps/web/app/restaurants/[restaurantId]/floor/page.tsx`, add
`useRouter` and `FormEvent` to the existing `"react"`/`"next/navigation"`
imports (the file already imports `useParams` from `"next/navigation"` —
add `useRouter` alongside it). Then, inside `FloorPage()`, add right after
the existing `restaurantQuery`/`listQuery` declarations (the file already
declares `const utils = trpc.useUtils();` a few lines above `restaurantQuery`
— reuse that same `utils`, don't redeclare it):

```tsx
const router = useRouter();
const statusQuery = trpc.station.myStationStatus.useQuery({ restaurantId });
const [pin, setPin] = useState("");
const [pinError, setPinError] = useState<string | null>(null);
const [isVerifyingPin, setIsVerifyingPin] = useState(false);

useEffect(() => {
	if (statusQuery.data?.deviceRevoked) {
		router.replace("/station/pair");
	}
}, [statusQuery.data?.deviceRevoked, router]);

async function handlePinSubmit(event: FormEvent<HTMLFormElement>) {
	event.preventDefault();
	setIsVerifyingPin(true);
	setPinError(null);
	const response = await fetch("/station/pin", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ restaurantId, pin }),
	});
	setIsVerifyingPin(false);
	if (!response.ok) {
		setPinError("PIN not recognized.");
		return;
	}
	setPin("");
	utils.station.myStationStatus.invalidate({ restaurantId });
}

async function handleSwitchUser() {
	await fetch("/station/pin", { method: "DELETE" });
	utils.station.myStationStatus.invalidate({ restaurantId });
}
```

`useEffect` is already imported in this file (used by `MergeDialog` below);
`verifyPinInput`'s PIN pattern isn't re-validated client-side here — the
fetch simply reports the server's 401 as "PIN not recognized," matching
`resolve_staff_by_pin`'s anti-enumeration posture.

Then, immediately after the opening `<div className="min-h-dvh ...">` and
before `<RestaurantNavHeader .../>`, add the blocking gate — it only shows
once we know the device isn't revoked, so it never flashes before the
`useEffect` above redirects:

```tsx
{statusQuery.data?.isStation &&
	!statusQuery.data.deviceRevoked &&
	!statusQuery.data.actingStaffName ? (
	<div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-glass p-4">
		<div className="w-full max-w-xs rounded-xl border border-divider bg-surface-elevated p-8">
			<h2 className="text-center text-lg text-primary">Enter your PIN</h2>
			<form onSubmit={handlePinSubmit} noValidate className="mt-6 space-y-4">
				<input
					type="password"
					inputMode="numeric"
					autoComplete="off"
					maxLength={6}
					placeholder="••••"
					value={pin}
					disabled={isVerifyingPin}
					onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
					className="w-full rounded-sm border border-divider bg-surface px-3 py-3 text-center text-2xl text-primary tracking-widest"
				/>
				{pinError ? (
					<p role="alert" className="text-center text-error text-sm">
						{pinError}
					</p>
				) : null}
				<button
					type="submit"
					disabled={isVerifyingPin || pin.length < 4}
					className="flex h-12 w-full items-center justify-center rounded-md bg-accent font-medium text-background text-sm disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{isVerifyingPin ? "Checking…" : "Unlock"}
				</button>
			</form>
		</div>
	</div>
) : null}
```

Finally, give the header an "Acting as" badge when unlocked — inside the
existing header area (right after `<RestaurantNavHeader ... />`, still
before `<main>`):

```tsx
{statusQuery.data?.actingStaffName ? (
	<div className="flex items-center justify-end gap-3 px-4 pt-4 lg:px-16 xl:px-24">
		<span className="text-secondary text-sm">
			Acting as {statusQuery.data.actingStaffName}
		</span>
		<button
			type="button"
			onClick={handleSwitchUser}
			className="text-accent text-sm hover:opacity-80"
		>
			Switch User
		</button>
	</div>
) : null}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/restaurants/[restaurantId]/floor/page.tsx apps/web/server/routers/station.ts
git commit -m "feat: gate Floor page behind PIN unlock for station devices"
```

---

### Task 12: Full verification pass

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: no errors. Fix any Biome findings in the files this plan touched.

- [ ] **Step 2: Typecheck (whole monorepo)**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: all pass, including the new `station-session` and `station.schema`
suites.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: succeeds, `/station/pair` and `/station/pin` route in the build
output.

- [ ] **Step 5: Commit anything the lint/format step touched**

```bash
git add -A
git commit -m "chore: lint/format fixes for station account feature"
```

(Skip this step if nothing changed.)

Per `AGENTS.md`: no dev server, no Playwright, no screenshots — this
verification pass is the finish line. The user tests the actual pairing +
PIN flow manually in their own browser afterward.
