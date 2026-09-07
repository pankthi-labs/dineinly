import type { User } from "@supabase/supabase-js";
import type { Database } from "@workspace/db";
import { redirect } from "next/navigation";
import { cache } from "react";
import { STATION_EMAIL_SUFFIX } from "@/lib/station-session";
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

// If the current session is a paired station device, its restaurant id —
// otherwise null. Used only by the root page (app/page.tsx) to route a
// freshly reopened browser straight to Floor instead of the marketing
// stub: a station's Supabase session is long-lived and independent of
// whoever paired it (docs/architecture.md § Station Account Provisioning),
// but losing the tab otherwise leaves it with no way to find its way back.
// A station's underlying identity is one auth.users row per restaurant per
// station type, so user_id maps to at most one Staff row — unlike a real
// person, who can be staff at more than one restaurant.
export const getStationRestaurantId = cache(
	async (): Promise<string | null> => {
		const viewer = await getViewer();
		if (!viewer || viewer.isAdmin) {
			return null;
		}

		const supabase = await createClient();
		const { data: staffRow } = await supabase
			.from("staff")
			.select("restaurant_id, email")
			.eq("user_id", viewer.id)
			.eq("status", "active")
			.maybeSingle();

		if (!staffRow?.email.endsWith(STATION_EMAIL_SUFFIX)) {
			return null;
		}

		return staffRow.restaurant_id;
	},
);

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
	/** True only for the caller's own row when it's the restaurant's primary
	 * owner — false for Dineinly Admin (no Staff row) and every other
	 * viewer, including a non-primary co-owner (role = 'owner' but
	 * is_primary_owner = false). Gates Owner reassignment (Tbd.md "Owner
	 * reassignment"): only the current primary owner, not any Owner-role
	 * staff, may transfer ownership. */
	isPrimaryOwner: boolean;
	/** True when the caller's own session is a shared station device's
	 * synthetic identity (docs/architecture.md § Station Account
	 * Provisioning), not a named individual signed in via their own OTP —
	 * both carry the same restaurantRole ('waiter'), so this is the only way
	 * to tell them apart. False for Dineinly Admin (no Staff row). */
	isStation: boolean;
};

/**
 * Viewer, redirecting to /sign-in unless they may view restaurant
 * `restaurantId` — pages under app/restaurants/[restaurantId] (Home,
 * Menu Desk, etc.), reachable by both that restaurant's own active staff
 * (any role) and Dineinly Admin viewing any restaurant. Dineinly Admin
 * always passes.
 *
 * This grants page-level access only — every staff role reaches the same
 * pages once past this gate. Feature-level gating within a page is layered
 * on top via requireRestaurantRole below, for the subtrees docs/product.md's
 * RBAC narrows further (Staff Roster, Menu Desk, Table Matrix, Bills).
 */
export const requireRestaurantAccess = cache(
	async (restaurantId: string): Promise<RestaurantAccess> => {
		const viewer = await getViewer();

		if (!viewer) {
			redirect("/sign-in");
		}

		if (viewer.isAdmin) {
			return {
				...viewer,
				restaurantRole: null,
				isPrimaryOwner: false,
				isStation: false,
			};
		}

		// Scoped to the caller's own row via user_id, not RLS alone —
		// staff_roster_select (supabase/migrations/20260816164344_add_staff_roster_rpcs.sql)
		// gives Owner/Manager visibility into every active row at this
		// restaurant, not just their own.
		const supabase = await createClient();
		const { data: staffRow } = await supabase
			.from("staff")
			.select("id, role, is_primary_owner, email")
			.eq("restaurant_id", restaurantId)
			.eq("user_id", viewer.id)
			.eq("status", "active")
			.maybeSingle();

		if (!staffRow) {
			redirect("/sign-in");
		}

		return {
			...viewer,
			restaurantRole: staffRow.role,
			isPrimaryOwner: staffRow.is_primary_owner,
			isStation: staffRow.email.endsWith(STATION_EMAIL_SUFFIX),
		};
	},
);

/**
 * RestaurantAccess, redirecting to the restaurant home page (not /sign-in —
 * they're already signed in and do have restaurant access, just not to this
 * feature) unless the caller is Dineinly Admin or their restaurantRole is
 * one of `allowedRoles`. Layers a feature-level role gate on top of
 * requireRestaurantAccess's page-level one, for the route-tree subtrees
 * docs/product.md's RBAC narrows further (Staff Roster, Menu Desk, Table
 * Matrix, Bills layout.tsx files).
 */
export async function requireRestaurantRole(
	restaurantId: string,
	allowedRoles: StaffRole[],
): Promise<RestaurantAccess> {
	const viewer = await requireRestaurantAccess(restaurantId);

	if (
		!viewer.isAdmin &&
		(!viewer.restaurantRole || !allowedRoles.includes(viewer.restaurantRole))
	) {
		redirect(`/restaurants/${restaurantId}`);
	}

	return viewer;
}

/**
 * Redirects to the restaurant home page if the caller is a named Waiter's
 * own OTP session — not the shared station device, which also carries
 * restaurantRole 'waiter' but is unaffected here. A named Waiter's personal
 * login is account-management only (Profile/PIN, Pair This Device); real floor
 * work (Kitchen/Floor/Bills) only happens on a paired station or a
 * Manager/Owner session. No-op for every other role. Call after
 * requireRestaurantAccess/requireRestaurantRole in kitchen/floor/bills
 * layout.tsx.
 */
export async function requireNonIndividualWaiterAccess(
	restaurantId: string,
): Promise<void> {
	const viewer = await requireRestaurantAccess(restaurantId);

	if (viewer.restaurantRole === "waiter" && !viewer.isStation) {
		redirect(`/restaurants/${restaurantId}`);
	}
}

/**
 * The restaurant's Dineinly package. Deduped per request via cache() — both
 * requireFullServiceExperience below and restaurants/[restaurantId]/layout.tsx
 * (RestaurantViewerProvider's `experience` prop) need it, and a request can
 * hit both.
 */
export const getRestaurantExperience = cache(
	async (
		restaurantId: string,
	): Promise<Database["public"]["Enums"]["restaurant_experience"] | null> => {
		const supabase = await createClient();
		const { data } = await supabase
			.from("restaurants")
			.select("experience")
			.eq("id", restaurantId)
			.maybeSingle();

		return data?.experience ?? null;
	},
);

/**
 * Redirects to the restaurant home page unless the restaurant's package
 * (`restaurant.experience`) includes this feature. Dineinly Menu is
 * view-only (docs/product.md § Dineinly Experiences) — no tables, kitchen,
 * floor, or bills — so this isn't a permission question a role could pass,
 * unlike requireRestaurantRole above. Call after requireRestaurantAccess /
 * requireRestaurantRole in every subtree those features gate.
 */
export async function requireFullServiceExperience(
	restaurantId: string,
): Promise<void> {
	const experience = await getRestaurantExperience(restaurantId);

	if (experience === "menu") {
		redirect(`/restaurants/${restaurantId}`);
	}
}

/** Kitchen and Dineinly billing belong to One and Counter. Guest uses the
 * restaurant's existing kitchen and billing systems, with Floor handling
 * incoming table orders instead. */
export async function requireIntegratedServiceExperience(
	restaurantId: string,
): Promise<void> {
	const experience = await getRestaurantExperience(restaurantId);
	if (experience !== "one" && experience !== "counter") {
		redirect(`/restaurants/${restaurantId}`);
	}
}

/**
 * Redirects to the restaurant home page unless the restaurant's package has
 * a single universal QR — Dineinly Menu or Counter — for the one route
 * (`qr/layout.tsx`) both share instead of Table Matrix's per-table QRs:
 * Menu has no tables at all, Counter has one QR for every session.
 */
export async function requireUniversalQrExperience(
	restaurantId: string,
): Promise<void> {
	const experience = await getRestaurantExperience(restaurantId);

	if (experience !== "menu" && experience !== "counter") {
		redirect(`/restaurants/${restaurantId}`);
	}
}

/**
 * Redirects to the restaurant home page unless the restaurant's package
 * seats guests at physical tables — Guest or One. Dineinly Menu is
 * view-only and Counter is tableless self-service (one universal QR,
 * zero Restaurant Table rows — docs/product.md § Dineinly Experiences), so
 * neither has a Table Matrix or Floor to manage, unlike
 * requireFullServiceExperience above which only excludes Menu (Counter
 * still has Kitchen and Bills).
 */
export async function requireSeatedExperience(
	restaurantId: string,
): Promise<void> {
	const experience = await getRestaurantExperience(restaurantId);

	if (experience === "menu" || experience === "counter") {
		redirect(`/restaurants/${restaurantId}`);
	}
}
