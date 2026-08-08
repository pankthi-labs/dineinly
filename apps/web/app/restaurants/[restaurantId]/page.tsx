import { getViewer } from "@/lib/auth";
import { RestaurantHome } from "./restaurant-home";

export default async function RestaurantHomePage({
	params,
}: {
	params: Promise<{ restaurantId: string }>;
}) {
	const { restaurantId } = await params;
	// Already gated by app/restaurants/[restaurantId]/layout.tsx's
	// requireRestaurantAccess() — this call is just to read the display
	// name, not to re-authorize.
	const viewer = await getViewer();

	return (
		<RestaurantHome
			restaurantId={restaurantId}
			viewerName={viewer?.displayName ?? "there"}
		/>
	);
}
