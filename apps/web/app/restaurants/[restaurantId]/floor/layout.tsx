import type { ReactNode } from "react";
import {
	requireFullServiceExperience,
	requireRestaurantRole,
} from "@/lib/auth";

// Floor (Order on behalf of guest, Merge Tables — docs/product.md § RBAC)
// is Waiter/Manager/Owner/Dineinly Admin — same reach as Bills, Kitchen has
// no access. Menu has no tables or sessions to order for at all — no Floor.
// Counter has no tables to merge but does reach [sessionId] (only, never
// the table-list page above it) via the Bills tab's "Add Item" action, which
// reuses this same cart+submit machinery — requireFullServiceExperience
// (Menu only excluded) admits that, requireSeatedExperience would not.
export default async function FloorLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["waiter", "manager", "owner"]);
	await requireFullServiceExperience(restaurantId);
	return children;
}
