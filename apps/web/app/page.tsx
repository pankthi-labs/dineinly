import { redirect } from "next/navigation";
import { getStationRestaurantId } from "@/lib/auth";

// A paired station device that loses its tab (browser closed, OS restart)
// otherwise has no way back — its Supabase session survives, but nothing
// routes a fresh page load to the right place (see getStationRestaurantId's
// doc comment). Every other session still sees the stub below unchanged.
export default async function Page() {
	const stationRestaurantId = await getStationRestaurantId();
	if (stationRestaurantId) {
		redirect(`/restaurants/${stationRestaurantId}/floor`);
	}

	return <h1>Dineinly</h1>;
}
