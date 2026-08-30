import type { ReactNode } from "react";
import {
	requireFullServiceExperience,
	requireNonIndividualWaiterAccess,
	requireRestaurantRole,
} from "@/lib/auth";

// Every Bills action (Request/Settle/Close/Force-Terminate/correct —
// docs/product.md § RBAC) is Waiter/Manager/Owner/Dineinly Admin — Kitchen
// has no reach here at all. Dineinly Menu has no Bills — it's view-only. A
// named Waiter's own OTP session is excluded regardless of the role check
// above — Bills is a paired station's job, or Manager/Owner's
// (requireNonIndividualWaiterAccess).
export default async function BillsLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["waiter", "manager", "owner"]);
	await requireNonIndividualWaiterAccess(restaurantId);
	await requireFullServiceExperience(restaurantId);
	return children;
}
