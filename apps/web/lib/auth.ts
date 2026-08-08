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
 * `restaurantId` — pages under app/restaurants/[restaurantId] (Home,
 * Menu Desk, etc.), reachable by both that restaurant's own active staff
 * (any role) and Dineinly Admin viewing any restaurant. Dineinly Admin
 * always passes.
 *
 * This grants page-level access only — every staff role reaches the same
 * pages once past this gate. Feature-level gating within a page (e.g. a
 * waiter reaching Venue Settings) isn't implemented yet; see Tbd.md
 * "Feature-level staff permissions".
 */
export async function requireRestaurantAccess(
	restaurantId: string,
): Promise<Viewer> {
	const viewer = await getViewer();

	if (!viewer) {
		redirect("/sign-in");
	}

	if (viewer.isAdmin) {
		return viewer;
	}

	// RLS-scoped to the signed-in user's own session (staff_select_own_row,
	// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql §
	// 5) — this can only ever see the caller's own Staff row(s), so a match
	// here means an active Staff row at this restaurant, not anyone else's.
	const supabase = await createClient();
	const { data: staffRow } = await supabase
		.from("staff")
		.select("id")
		.eq("restaurant_id", restaurantId)
		.eq("status", "active")
		.maybeSingle();

	if (!staffRow) {
		redirect("/sign-in");
	}

	return viewer;
}
