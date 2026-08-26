"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { env } from "@/lib/env";
import { trpc } from "@/lib/trpc-client";

// One guest realtime connection per tab, shared by every page that mounts
// useGuestRealtime() — a fresh client per page would open a redundant
// websocket on every navigation within the guest flow.
let sharedClient: SupabaseClient | null = null;

/**
 * Guest-side realtime identity: an anon-key client authenticated with the
 * guest's own JWT (fetched once via guest.realtimeAuth — the token itself
 * lives in an httpOnly cookie server-side, see server/trpc/context.ts),
 * plus the ids callers need to build session:{id}/menu:{id} topic strings.
 * Everything stays null until the token loads; useBroadcastChannel no-ops
 * on null, so callers don't need their own loading branch.
 */
export function useGuestRealtime() {
	const auth = trpc.guest.realtimeAuth.useQuery(undefined, {
		staleTime: Number.POSITIVE_INFINITY,
	});
	const [client, setClient] = useState<SupabaseClient | null>(null);

	useEffect(() => {
		if (!auth.data) return;
		sharedClient ??= createClient(
			env.NEXT_PUBLIC_SUPABASE_URL,
			env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		);
		sharedClient.realtime.setAuth(auth.data.token);
		setClient(sharedClient);
	}, [auth.data]);

	return {
		client,
		restaurantId: auth.data?.restaurantId ?? null,
		sessionId: auth.data?.sessionId ?? null,
	};
}
