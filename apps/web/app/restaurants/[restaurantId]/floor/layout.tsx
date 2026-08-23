import type { ReactNode } from "react";
import {
	requireFullServiceExperience,
	requireRestaurantRole,
} from "@/lib/auth";

// Floor (Order on behalf of guest, Merge Tables — docs/product.md § RBAC)
// is Waiter/Manager/Owner/Dineinly Admin — same reach as Bills, Kitchen has
// no access. Dineinly Menu has no tables to merge or order for — no Floor.
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
