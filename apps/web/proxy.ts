import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

// Refreshes the Supabase Auth session cookie on every request so it never
// silently expires between page loads. Authorization (is this user a
// Dineinly Admin?) happens in apps/web/app/admin/layout.tsx via
// requireAdmin() — this proxy only keeps the session alive.
export async function proxy(request: NextRequest) {
	let response = NextResponse.next({ request });

	const supabase = createServerClient(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => request.cookies.getAll(),
				setAll: (cookiesToSet) => {
					for (const { name, value } of cookiesToSet) {
						request.cookies.set(name, value);
					}
					response = NextResponse.next({ request });
					for (const { name, value, options } of cookiesToSet) {
						response.cookies.set(name, value, options);
					}
				},
			},
		},
	);

	// Revalidates the session with Supabase Auth (not just reading the
	// cookie), which is what triggers a refresh when it's near expiry.
	await supabase.auth.getUser();

	return response;
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
