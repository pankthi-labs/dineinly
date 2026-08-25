// Dineinly Counter guest-facing status (docs/core-data-model.md § Lifecycle
// invariants): kitchen never starts on a Counter order until its session's
// Bill is `settled`, so the guest can't see "Preparing" before that — it
// would be a lie. Shared between the menu page's "My Orders" summary and the
// orders page's item grouping so both name the same three stages.
export type CounterOrderItem = { served: boolean; ready: boolean };
export type CounterOrderStatus = "awaiting" | "preparing" | "done";

export function isCounterOrderDone(item: CounterOrderItem): boolean {
	return item.served || item.ready;
}

export function counterOrderStatus(
	items: CounterOrderItem[],
	billSettled: boolean,
): CounterOrderStatus {
	if (!billSettled) return "awaiting";
	return items.length > 0 && items.every(isCounterOrderDone)
		? "done"
		: "preparing";
}

export const COUNTER_STATUS_LABEL: Record<CounterOrderStatus, string> = {
	awaiting: "Awaiting Payment",
	preparing: "Preparing",
	done: "Ready for Pickup",
};
