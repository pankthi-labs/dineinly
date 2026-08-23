import type { ReactNode } from "react";
import { requireFullServiceExperience } from "@/lib/auth";

// "View Kitchen Queue" (docs/product.md § RBAC) is any active staff member —
// no role gate, unlike Table Matrix/Bills/Floor — so unlike those siblings
// this adds no requireRestaurantRole/requireRestaurantAccess of its own; the
// parent restaurants/[restaurantId]/layout.tsx already covers page-level
// access. Dineinly Menu has no kitchen at all, though: it's view-only.
export default async function KitchenLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireFullServiceExperience(restaurantId);
	return children;
}
