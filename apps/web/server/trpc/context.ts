import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { type GuestClaims, verifyGuestToken } from "@/lib/guest-token";

// Blueprint only: cookie name and guest-session resolution land with the
// actual guest flow (QR scan → session → mint). This just defines the
// shape every procedure/router builds on.
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
	const supabase = createServerClient(
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
			...(guestToken && {
				global: { headers: { Authorization: `Bearer ${guestToken}` } },
			}),
		},
	);

	return { guest, supabase };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
