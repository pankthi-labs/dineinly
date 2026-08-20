import { createServerClient } from "@supabase/ssr";
import type { Database } from "@workspace/db";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { type GuestClaims, verifyGuestToken } from "@/lib/guest-token";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import {
	STATION_DEVICE_ID_COOKIE,
	STATION_SESSION_COOKIE,
	verifyStationSessionToken,
} from "@/lib/station-session";

// Cookie carrying the guest session's signed JWT (see lib/guest-token.ts).
// Every procedure reads guest identity from ctx.guest, derived here once.
const GUEST_TOKEN_COOKIE = "dineinly_guest_token";

export async function createContext() {
	const cookieStore = await cookies();
	const guestToken = cookieStore.get(GUEST_TOKEN_COOKIE)?.value;
	const guest: GuestClaims | null = guestToken
		? await verifyGuestToken(guestToken)
		: null;

	const stationSessionToken = cookieStore.get(STATION_SESSION_COOKIE)?.value;
	const stationSession = stationSessionToken
		? await verifyStationSessionToken(stationSessionToken)
		: null;

	// Plain, unsigned — just an identifier for is_station_device_revoked(),
	// not a credential. See lib/station-session.ts's comment on why this one
	// doesn't need signing.
	const stationDeviceId = cookieStore.get(STATION_DEVICE_ID_COOKIE)?.value ?? null;

	// Anon-key client, scoped to this request. Forwarding the guest JWT as
	// the bearer token is what makes RLS evaluate the guest's claims (see
	// docs/architecture.md § Guest Sessions) — Supabase validates the
	// signature against supabase/signing_keys.json, not this app.
	const supabase = createServerClient<Database>(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => cookieStore.getAll(),
				// No-op: this context is built for reads inside the tRPC fetch
				// handler, which doesn't hold a mutable response. Cookie writes
				// (e.g. setting the guest token) happen where a response exists —
				// a Route Handler or Server Component — not here.
				setAll: () => {},
			},
			// Only ever attach the header once the token has verified — an
			// unverified cookie (expired, tampered, wrong key) must never reach
			// Supabase as a Bearer credential, even though ctx.guest is null and
			// guestProcedure will reject: any publicProcedure touching
			// ctx.supabase before that check would otherwise run authenticated
			// as whatever the cookie claimed.
			...(guest && {
				global: { headers: { Authorization: `Bearer ${guestToken}` } },
			}),
		},
	);

	// Session-authenticated client for staff/admin procedures (adminProcedure,
	// trpc/init.ts) — @supabase/ssr's cookie-based client, same factory
	// lib/auth.ts uses server-side. Distinct from `supabase` above: that one
	// is anon-key + a manually forwarded guest JWT bearer, this one reads the
	// real Supabase Auth session cookie, so RLS evaluates the signed-in
	// admin's own claims (is_dineinly_admin(), see
	// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 4).
	const auth = await createAuthClient();

	// Raw JWT, not just the parsed claims — guest.realtimeAuth (server/
	// routers/guest.ts) hands this to the browser so it can call
	// supabase.realtime.setAuth() itself. The httpOnly cookie above never
	// reaches client JS, so this is the one place the token crosses that
	// boundary; it carries no more trust than the cookie already does; every
	// authenticated tRPC call from this browser is already running as this
	// same guest.
	return {
		guest,
		guestToken: guest ? (guestToken ?? null) : null,
		supabase,
		auth,
		stationSession,
		stationDeviceId,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
