"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { NoGuestSession } from "@/components/guest-page-states";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { useGuestRealtime } from "@/lib/realtime/use-guest-realtime";

// force_terminate_session() / close_session() end a session out from under a
// guest who's still sitting on the menu/cart/bill screen — none of those
// pages' own queries are session-scoped enough to notice on their own (guest
// realtime session.change, § 20260730150634_add_auth_fk_and_rls_policies.sql
// no session/menu ordering: menu.get isn't gated by session status at all).
// One listener here, above every guest route, catches it live instead of
// leaving the guest staring at a screen from a visit that's already over
// until they happen to refresh.
export default function GuestLayout({ children }: { children: ReactNode }) {
	const { client, sessionId } = useGuestRealtime();
	const [sessionEnded, setSessionEnded] = useState(false);

	useBroadcastChannel(client, sessionId ? `session:${sessionId}` : null, {
		"session.change": (payload) => {
			const status = (payload as { status?: string }).status;
			if (status && status !== "active") setSessionEnded(true);
		},
	});

	if (sessionEnded) return <NoGuestSession />;
	return children;
}
