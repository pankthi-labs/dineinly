import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getViewer } from "@/lib/auth";

// Pairing requires an existing session — any signed-in staff role or
// Dineinly Admin, not scoped to a specific restaurant, since the pairing
// code itself (not this page) is what determines which restaurant/station
// type gets paired. A brand-new device has no session of its own, so
// whoever is provisioning it signs in individually first (their own OTP
// login), then reaches this page via the header's "Pair This Device" —
// never by typing this URL with no session at all.
export default async function StationPairLayout({
	children,
}: {
	children: ReactNode;
}) {
	const viewer = await getViewer();

	if (!viewer) {
		redirect("/sign-in");
	}

	return children;
}
