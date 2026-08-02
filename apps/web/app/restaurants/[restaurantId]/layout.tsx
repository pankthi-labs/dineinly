import type { ReactNode } from "react";
import { requireRestaurantAccess } from "@/lib/auth";

// Gates every restaurant-scoped page. The helper currently admits Dineinly
// Admins and will gain its staff branch with the staff authentication flow.
export default async function RestaurantLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantAccess(restaurantId);

	return children;
}
