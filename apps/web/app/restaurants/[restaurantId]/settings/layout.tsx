import type { ReactNode } from "react";
import { requireRestaurantRole } from "@/lib/auth";

// Restaurant Settings (docs/product.md § RBAC) is Owner + Dineinly Admin
// only — Manager is excluded, unlike Staff Roster's Owner/Manager reach.
export default async function VenueSettingsLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["owner"]);
	return children;
}
