import type { ReactNode } from "react";
import { requireRestaurantRole, requireSeatedExperience } from "@/lib/auth";

// Floor (Order on behalf of guest, Merge Tables — docs/product.md § RBAC)
// is Waiter/Manager/Owner/Dineinly Admin — same reach as Bills, Kitchen has
// no access. Menu and Counter have no tables to merge or order for — no
// Floor, no Waiter role either (see staff/page.tsx).
export default async function FloorLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["waiter", "manager", "owner"]);
	await requireSeatedExperience(restaurantId);
	return children;
}
