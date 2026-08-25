import type { ReactNode } from "react";
import {
	requireRestaurantRole,
	requireUniversalQrExperience,
} from "@/lib/auth";

// Manage Tables & QR Codes (docs/product.md § RBAC) is Owner/Manager/
// Dineinly Admin only. QR Menu is Menu and Counter's shared Table Matrix
// counterpart — Guest/One already manage their per-table QRs there instead.
export default async function QrMenuLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["owner", "manager"]);
	await requireUniversalQrExperience(restaurantId);
	return children;
}
