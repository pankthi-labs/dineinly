"use client";

import type { Database } from "@workspace/db";
import { createContext, type ReactNode, useContext } from "react";
import type { StaffRole } from "@/lib/auth";

type RestaurantExperience =
	Database["public"]["Enums"]["restaurant_experience"];

type RestaurantViewer = {
	isAdmin: boolean;
	/** Caller's own active Staff role at this restaurant, or null for
	 * Dineinly Admin (see lib/auth.ts RestaurantAccess). */
	restaurantRole: StaffRole | null;
	/** True only when the caller's own row is the restaurant's primary
	 * owner (see lib/auth.ts RestaurantAccess). */
	isPrimaryOwner: boolean;
	/** The restaurant's Dineinly package (docs/product.md § Dineinly
	 * Experiences). Drives useIsMenuOnly below. */
	experience: RestaurantExperience;
};

const RestaurantViewerContext = createContext<RestaurantViewer | null>(null);

export function RestaurantViewerProvider({
	isAdmin,
	restaurantRole,
	isPrimaryOwner,
	experience,
	children,
}: RestaurantViewer & { children: ReactNode }) {
	return (
		<RestaurantViewerContext.Provider
			value={{ isAdmin, restaurantRole, isPrimaryOwner, experience }}
		>
			{children}
		</RestaurantViewerContext.Provider>
	);
}

function useRestaurantViewer(): RestaurantViewer {
	const viewer = useContext(RestaurantViewerContext);
	if (viewer === null) {
		throw new Error(
			"useIsAdmin/useCanManageStaff must be used within RestaurantViewerProvider",
		);
	}
	return viewer;
}

export function useIsAdmin(): boolean {
	return useRestaurantViewer().isAdmin;
}

export function useRestaurantRole(): StaffRole | null {
	return useRestaurantViewer().restaurantRole;
}

// Dineinly Menu (docs/product.md § Dineinly Experiences) is view-only — no
// tables, kitchen, floor, or bills. Client-side UX only (hides the nav/cards
// for the feature) — see requireFullServiceExperience (lib/auth.ts) and
// requireFullServiceRole (server/trpc/rbac.ts) for the real, server-enforced
// gate.
export function useIsMenuOnly(): boolean {
	return useRestaurantViewer().experience === "menu";
}

// Dineinly Counter (docs/product.md § Dineinly Experiences) is
// self-service, quick-turnaround — no Waiter marks the pickup complete,
// Kitchen does (see kitchen/page.tsx's canServe). Client-side UX only —
// see kitchen.ts's serveBatch for the real, server-enforced gate.
export function useIsCounter(): boolean {
	return useRestaurantViewer().experience === "counter";
}

// Owner reassignment (Tbd.md "Owner reassignment"): only the current
// primary owner or Dineinly Admin — stricter than useCanManageStaff, which
// any Owner-role or Manager row passes. Client-side UX only — see
// reassign_primary_owner (supabase/migrations/
// 20260816164344_add_staff_roster_rpcs.sql § 15c) for the real,
// server-enforced check.
export function useCanReassignOwner(): boolean {
	const { isAdmin, isPrimaryOwner } = useRestaurantViewer();
	return isAdmin || isPrimaryOwner;
}

// Manage Staff (docs/product.md § RBAC): Owner, Manager, and Dineinly Admin
// only — everyone else (Waiter, Kitchen) is excluded. Client-side UX only,
// never the real gate — see app/restaurants/[restaurantId]/staff/layout.tsx
// and the invite_staff/update_staff/remove_staff RPCs for the actual,
// server-enforced check (AGENTS.md: "client-side checks are UX only").
export function useCanManageStaff(): boolean {
	const { isAdmin, restaurantRole } = useRestaurantViewer();
	return isAdmin || restaurantRole === "owner" || restaurantRole === "manager";
}

// Every Bills action (docs/product.md § RBAC) excludes Kitchen only —
// Waiter/Manager/Owner/Admin all reach it. Client-side UX only — see
// bills/layout.tsx for the real, server-enforced gate.
export function useCanAccessBills(): boolean {
	const { isAdmin, restaurantRole } = useRestaurantViewer();
	return isAdmin || restaurantRole !== "kitchen";
}

// Restaurant Settings (docs/product.md § RBAC) is Owner + Dineinly Admin
// only — narrower than Manage Staff, which Manager also reaches. Client-side
// UX only — see settings/layout.tsx for the real, server-enforced gate.
export function useCanAccessSettings(): boolean {
	const { isAdmin, restaurantRole } = useRestaurantViewer();
	return isAdmin || restaurantRole === "owner";
}
