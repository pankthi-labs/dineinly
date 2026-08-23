import type { ReactNode } from "react";
import { getRestaurantExperience, requireRestaurantAccess } from "@/lib/auth";
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

	// Every restaurant-scoped page needs this to decide what's visible
	// (RestaurantNavHeader, RestaurantHome, Staff Roster's role picker) —
	// cache()-deduped with requireFullServiceExperience's own call below it
	// in the tree, so this is never a second round trip.
	const experience = await getRestaurantExperience(restaurantId);

	return (
		<RestaurantViewerProvider
			isAdmin={viewer.isAdmin}
			restaurantRole={viewer.restaurantRole}
			isPrimaryOwner={viewer.isPrimaryOwner}
			experience={experience ?? "one"}
		>
			{children}
		</RestaurantViewerProvider>
	);
}
