import type { ReactNode } from "react";
import {
	requireFullServiceExperience,
	requireRestaurantRole,
} from "@/lib/auth";

// Manage Tables & QR Codes (docs/product.md § RBAC) is Owner/Manager/
// Dineinly Admin only. Dineinly Menu exposes no Table Matrix at all — its one
// QR lives on Venue Settings instead (see settings/qr-code-section.tsx).
export default async function TableMatrixLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["owner", "manager"]);
	await requireFullServiceExperience(restaurantId);
	return children;
}
