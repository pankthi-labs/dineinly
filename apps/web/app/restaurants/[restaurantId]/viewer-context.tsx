"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { StaffRole } from "@/lib/auth";

type RestaurantViewer = {
	isAdmin: boolean;
	/** Caller's own active Staff role at this restaurant, or null for
	 * Dineinly Admin (see lib/auth.ts RestaurantAccess). */
	restaurantRole: StaffRole | null;
};

const RestaurantViewerContext = createContext<RestaurantViewer | null>(null);

export function RestaurantViewerProvider({
	isAdmin,
	restaurantRole,
	children,
}: RestaurantViewer & { children: ReactNode }) {
	return (
		<RestaurantViewerContext.Provider value={{ isAdmin, restaurantRole }}>
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

// Manage Staff (docs/product.md § RBAC): Owner, Manager, and Dineinly Admin
// only — everyone else (Waiter, Kitchen) is excluded. Client-side UX only,
// never the real gate — see app/restaurants/[restaurantId]/staff/layout.tsx
// and the invite_staff/update_staff/remove_staff RPCs for the actual,
// server-enforced check (AGENTS.md: "client-side checks are UX only").
export function useCanManageStaff(): boolean {
	const { isAdmin, restaurantRole } = useRestaurantViewer();
	return isAdmin || restaurantRole === "owner" || restaurantRole === "manager";
}
