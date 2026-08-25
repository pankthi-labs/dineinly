export type GuestOrder = {
	id: string;
	number: number;
	status: "preparing" | "partially served" | "served";
	items: {
		id: string;
		name: string;
		quantity: number;
		served: boolean;
		ready: boolean;
		// Counter only — always true elsewhere (orderGroups below never reads
		// it), since nothing gates Full-Service's kitchen fire.
		released: boolean;
	}[];
};

// Full-Service (One): a "partially served" order renders as two group rows
// sharing the order number — one still Preparing, one already Served —
// merging back into a single row once every item reaches that state
// (docs/product.md: guest sees the derived order status, never per-item
// granularity, so status lives on the group, not the line). One order per
// round is the normal shape here, so the order number stays in the heading.
// Counter reuses this same shape (see counterOrderGroups below) but with no
// order number, since a session's orders are one payable unit, not rounds —
// and a third "unsent" status the guest acts on directly (Send to Kitchen),
// which orderGroups here never produces.
export type OrderGroup = {
	key: string;
	number: number | null;
	status: "unsent" | "preparing" | "ready" | "done";
	items: { id: string; name: string; quantity: number }[];
};

// "unsent" reuses the Kitchen Display's own "Incoming" color (kitchen/
// page.tsx's COLUMN_STYLE) — same stage, guest side of the same queue.
// "ready" reuses its "Ready" column color too — the guest-side view of that
// same stage, distinct from "done" (picked up, nothing left to do).
export const GROUP_DOT_CLASS: Record<OrderGroup["status"], string> = {
	unsent: "bg-info",
	preparing: "bg-warning",
	ready: "bg-success",
	done: "bg-success",
};

export const GROUP_TEXT_CLASS: Record<OrderGroup["status"], string> = {
	unsent: "text-info",
	preparing: "text-warning",
	ready: "text-success",
	done: "text-success",
};

export function orderGroups(order: GuestOrder): OrderGroup[] {
	const preparing = order.items.filter((item) => !item.served);
	const done = order.items.filter((item) => item.served);
	const groups: OrderGroup[] = [];
	if (preparing.length > 0) {
		groups.push({
			key: `${order.id}-preparing`,
			number: order.number,
			status: "preparing",
			items: preparing,
		});
	}
	if (done.length > 0) {
		groups.push({
			key: `${order.id}-done`,
			number: order.number,
			status: "done",
			items: done,
		});
	}
	return groups;
}

// Counter: every order placed in a session settles as one payable unit
// (docs/product.md: Counter is capped at one bill/token per session even
// though it can span several confirms), so this flattens every order's
// items into a single unsent/preparing/done split instead of one group per
// order — same visual language as Full-Service, just no order number in the
// heading and a third stage: the guest chooses when each paid item goes to
// the kitchen (release_order_item_to_kitchen(), server/routers/guest.ts), so
// "settled but not sent yet" is its own group the guest acts on directly.
export function counterOrderGroups(orders: GuestOrder[]): OrderGroup[] {
	const items = orders.flatMap((order) => order.items);
	const unsent = items.filter((item) => !item.released);
	const preparing = items.filter(
		(item) => item.released && !item.ready && !item.served,
	);
	const ready = items.filter(
		(item) => item.released && item.ready && !item.served,
	);
	const done = items.filter((item) => item.released && item.served);
	const groups: OrderGroup[] = [];
	if (unsent.length > 0) {
		groups.push({
			key: "unsent",
			number: null,
			status: "unsent",
			items: unsent,
		});
	}
	if (preparing.length > 0) {
		groups.push({
			key: "preparing",
			number: null,
			status: "preparing",
			items: preparing,
		});
	}
	if (ready.length > 0) {
		groups.push({ key: "ready", number: null, status: "ready", items: ready });
	}
	if (done.length > 0) {
		groups.push({ key: "done", number: null, status: "done", items: done });
	}
	return groups;
}
