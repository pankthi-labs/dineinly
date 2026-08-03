import { createServerClient } from "@supabase/ssr";
import type { Database } from "@workspace/db";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { type GuestClaims, verifyGuestToken } from "@/lib/guest-token";
import { createClient as createAuthClient } from "@/lib/supabase/server";

// Cookie carrying the guest session's signed JWT (see lib/guest-token.ts).
// Every procedure reads guest identity from ctx.guest, derived here once.
const GUEST_TOKEN_COOKIE = "dineinly_guest_token";

export async function createContext() {
	const cookieStore = await cookies();
	const guestToken = cookieStore.get(GUEST_TOKEN_COOKIE)?.value;
	const guest: GuestClaims | null = guestToken
		? await verifyGuestToken(guestToken)
		: null;

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

	return { guest, supabase, auth };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
