import type { ReactNode } from "react";
import { requireRestaurantAccess } from "@/lib/auth";
import { RestaurantViewerProvider } from "./viewer-context";

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
	const viewer = await requireRestaurantAccess(restaurantId);

	return (
		<RestaurantViewerProvider
			isAdmin={viewer.isAdmin}
			restaurantRole={viewer.restaurantRole}
		>
			{children}
		</RestaurantViewerProvider>
	);
}
