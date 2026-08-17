import type { ReactNode } from "react";
import { requireRestaurantRole } from "@/lib/auth";

// Manage Menu (docs/product.md § RBAC) is Owner/Manager/Dineinly Admin only.
export default async function MenuDeskLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["owner", "manager"]);
	return children;
}
