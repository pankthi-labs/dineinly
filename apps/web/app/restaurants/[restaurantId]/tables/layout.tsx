import type { ReactNode } from "react";
import { requireRestaurantRole, requireSeatedExperience } from "@/lib/auth";

// Manage Tables & QR Codes (docs/product.md § RBAC) is Owner/Manager/
// Dineinly Admin only. Menu and Counter expose no Table Matrix at all —
// their one QR lives on the shared QR Menu page instead (see ../qr/page.tsx).
export default async function TableMatrixLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	await requireRestaurantRole(restaurantId, ["owner", "manager"]);
	await requireSeatedExperience(restaurantId);
	return children;
}
