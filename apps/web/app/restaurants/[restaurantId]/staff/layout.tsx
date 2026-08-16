import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireRestaurantAccess } from "@/lib/auth";

// The one restaurant-scoped subtree gated past requireRestaurantAccess's
// usual "any active staff role" reach — Manage Staff (docs/product.md §
// RBAC) is Owner/Manager/Dineinly Admin only. Everyone else bounces to the
// restaurant home page, not /sign-in — they're already signed in and do
// have restaurant access, just not to this feature.
export default async function StaffRosterLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	const viewer = await requireRestaurantAccess(restaurantId);

	if (
		!viewer.isAdmin &&
		viewer.restaurantRole !== "owner" &&
		viewer.restaurantRole !== "manager"
	) {
		redirect(`/restaurants/${restaurantId}`);
	}

	return children;
}
