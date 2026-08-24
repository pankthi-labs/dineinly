import type { ReactNode } from "react";
import { requireMenuExperience, requireRestaurantRole } from "@/lib/auth";

// Manage Tables & QR Codes (docs/product.md § RBAC) is Owner/Manager/
// Dineinly Admin only. QR Menu is Dineinly Menu's Table Matrix counterpart —
// full-service restaurants already manage their QRs there instead.
export default async function QrMenuLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["owner", "manager"]);
	await requireMenuExperience(restaurantId);
	return children;
}
