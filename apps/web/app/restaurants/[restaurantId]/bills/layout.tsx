import type { ReactNode } from "react";
import { requireRestaurantRole } from "@/lib/auth";

// Every Bills action (Request/Settle/Close/Force-Terminate/correct —
// docs/product.md § RBAC) is Waiter/Manager/Owner/Dineinly Admin — Kitchen
// has no reach here at all.
export default async function BillsLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["waiter", "manager", "owner"]);
	return children;
}
