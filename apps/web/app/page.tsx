import { redirect } from "next/navigation";
import { getStationRestaurantId } from "@/lib/auth";
import { HomeContent } from "./home-content";

export default async function Page() {
	// A paired station device that loses its tab (browser closed, OS restart)
	// otherwise has no way back. Its Supabase session survives, but nothing
	// routes a fresh page load to the right place (see getStationRestaurantId's
	// doc comment). Every other visitor sees the marketing home page below.
	const stationRestaurantId = await getStationRestaurantId();
	if (stationRestaurantId) {
		redirect(`/restaurants/${stationRestaurantId}/floor`);
	}

	return <HomeContent />;
}
