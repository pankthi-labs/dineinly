import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Dineinly Admin identity and its app_metadata.app_role claim: see
// docs/architecture.md § Authentication. This is the single point where
// "is this user an admin" is decided app-side; RLS checks the same claim
// independently in
// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 4.
const DINEINLY_ADMIN_ROLE = "dineinly_admin";

export function isDineinlyAdmin(user: User | null): boolean {
	return user?.app_metadata?.app_role === DINEINLY_ADMIN_ROLE;
}

export type Viewer = {
	id: string;
	email: string;
	displayName: string;
	isAdmin: boolean;
};

// Deduped per request (React's request-scoped cache) — both
// app/admin/layout.tsx's requireAdmin() and app/admin/page.tsx call this,
// and each call is a real round trip to Supabase Auth, not just a cookie
// read.
export const getViewer = cache(async (): Promise<Viewer | null> => {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user?.email) {
		return null;
	}

	return {
		id: user.id,
		email: user.email,
		displayName: user.user_metadata?.display_name ?? user.email,
		isAdmin: isDineinlyAdmin(user),
	};
});

/** Viewer, redirecting to /sign-in if not a Dineinly Admin. */
export async function requireAdmin(): Promise<Viewer> {
	const viewer = await getViewer();

	if (!viewer?.isAdmin) {
		redirect("/sign-in");
	}

	return viewer;
}

/**
 * Viewer, redirecting to /sign-in unless they may view restaurant
 * `restaurantId` — pages under app/restaurants/[restaurantId] (menu,
 * staff, etc.), reachable by both that restaurant's own staff and
 * Dineinly Admin viewing any restaurant. Dineinly Admin always passes.
 *
 * Staff access is not implemented yet — an invited Staff row can now link
 * to a real session and reach status = "active" (see
 * supabase/migrations/20260803042459_add_staff_auth_flow.sql), but Staff
 * still has no RLS of its own (see supabase/migrations/
 * 20260730150634_add_auth_fk_and_rls_policies.sql: "Every staff-side
 * policy: lands with the staff auth flow"), so there's no query this
 * function could run yet. Add the check here — viewer's Staff row has
 * restaurant_id === restaurantId and status === "active" — once that
 * RLS exists.
 */
export async function requireRestaurantAccess(
	// Unused until the staff-side check above lands — kept named in the
	// signature (not dropped) so callers already pass the real id.
	_restaurantId: string,
): Promise<Viewer> {
	// Delegates rather than repeating requireAdmin's check — until the
	// staff-side branch above lands, this function IS "must be admin."
	return requireAdmin();
}
