import type { User } from "@supabase/supabase-js";
import type { Database } from "@workspace/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = Database["public"]["Enums"]["staff_role"];

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

export type RestaurantAccess = Viewer & {
	/** Caller's own active Staff role at this restaurant, or null for
	 * Dineinly Admin — who has no Staff row anywhere by design. */
	restaurantRole: StaffRole | null;
};

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
 * "Feature-level staff permissions". Staff Roster is the one exception —
 * app/restaurants/[restaurantId]/staff/layout.tsx reads restaurantRole off
 * this function's return value to additionally gate that one subtree to
 * Owner/Manager, per docs/product.md's RBAC "Manage Staff" row, which is
 * also why that layout calls this function a second time for the same
 * request — deduped by the cache() wrapper below rather than a second round
 * trip to Postgres.
 */
export const requireRestaurantAccess = cache(
	async (restaurantId: string): Promise<RestaurantAccess> => {
		const viewer = await getViewer();

		if (!viewer) {
			redirect("/sign-in");
		}

		if (viewer.isAdmin) {
			return { ...viewer, restaurantRole: null };
		}

		// Scoped to the caller's own row via user_id, not RLS alone —
		// staff_roster_select (supabase/migrations/20260816164344_add_staff_roster_rpcs.sql)
		// gives Owner/Manager visibility into every active row at this
		// restaurant, not just their own.
		const supabase = await createClient();
		const { data: staffRow } = await supabase
			.from("staff")
			.select("id, role")
			.eq("restaurant_id", restaurantId)
			.eq("user_id", viewer.id)
			.eq("status", "active")
			.maybeSingle();

		if (!staffRow) {
			redirect("/sign-in");
		}

		return { ...viewer, restaurantRole: staffRow.role };
	},
);
