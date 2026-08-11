"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";

type BroadcastHandlers = Record<string, (payload: unknown) => void>;

/**
 * Subscribes `client` to `topic`'s broadcast events for as long as the
 * component is mounted and both are non-null; no-ops (and tears down any
 * existing subscription) otherwise. Audience-agnostic — guest, kitchen, and
 * any future staff/waiter page all use this same hook, differing only in
 * which client (guest vs. staff auth) and topic string they pass in. See
 * docs/realtime.md § Subscribe Side — Client.
 */
export function useBroadcastChannel(
	client: SupabaseClient | null,
	topic: string | null,
	handlers: BroadcastHandlers,
) {
	// Resubscribing on every render would thrash the channel, so the effect
	// below only depends on [client, topic]; handlers are read through this
	// ref instead so a caller's latest closures are always used, not just
	// whichever ones happened to be passed on the render that (re)subscribed.
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	useEffect(() => {
		if (!client || !topic) return;

		const channel: RealtimeChannel = client.channel(topic, {
			config: { private: true },
		});
		for (const event of Object.keys(handlersRef.current)) {
			channel.on("broadcast", { event }, ({ payload }) =>
				handlersRef.current[event]?.(payload),
			);
		}
		channel.subscribe();

		return () => {
			client.removeChannel(channel);
		};
	}, [client, topic]);
}
