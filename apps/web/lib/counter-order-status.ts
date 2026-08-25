// Dineinly Counter guest-facing status (docs/core-data-model.md § Lifecycle
// invariants): kitchen never starts on a Counter order until its session's
// Bill is `settled`, so the guest can't see "Preparing" before that — it
// would be a lie. Once settled, the guest still chooses when to release each
// item to the kitchen at their own pace (docs/product.md § Order Lifecycle),
// so "settled but nothing sent yet" is its own stage too. Shared between the
// menu page's "My Orders" summary and the orders page's item grouping so
// both name the same five stages.
export type CounterOrderItem = {
	released: boolean;
	served: boolean;
	ready: boolean;
};
export type CounterOrderStatus =
	| "awaiting"
	| "unsent"
	| "preparing"
	| "ready"
	| "done";

export function isCounterOrderDone(item: CounterOrderItem): boolean {
	return item.served || item.ready;
}

export function counterOrderStatus(
	items: CounterOrderItem[],
	billSettled: boolean,
): CounterOrderStatus {
	if (!billSettled) return "awaiting";
	if (items.length === 0 || items.every((item) => !item.released)) {
		return "unsent";
	}
	if (!items.every((item) => item.released && isCounterOrderDone(item))) {
		return "preparing";
	}
	// Every item has left the kitchen (ready or served), but "ready" (still
	// sitting at the counter) and "served" (already picked up) aren't the same
	// guest-facing stage — telling a guest who's already picked up everything
	// to go get their food would be a lie, same reasoning as the settle gate
	// above.
	return items.every((item) => item.served) ? "done" : "ready";
}

export const COUNTER_STATUS_LABEL: Record<CounterOrderStatus, string> = {
	awaiting: "Awaiting Payment",
	unsent: "Ready to Send",
	preparing: "Preparing",
	ready: "Ready for Pickup",
	done: "Picked Up",
};
