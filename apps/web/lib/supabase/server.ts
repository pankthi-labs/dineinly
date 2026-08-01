import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Server-side Supabase client for staff/admin auth (Email OTP session
// cookies via @supabase/ssr) — separate from the guest JWT path in
// lib/guest-token.ts, which never creates a Supabase Auth user.
export async function createClient() {
	const cookieStore = await cookies();

	return createServerClient(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => cookieStore.getAll(),
				setAll: (cookiesToSet) => {
					// Throws when called from a Server Component (no response to
					// attach cookies to) — safe to ignore there because
					// proxy.ts refreshes the session on every request.
					try {
						for (const { name, value, options } of cookiesToSet) {
							cookieStore.set(name, value, options);
						}
					} catch {}
				},
			},
		},
	);
}
