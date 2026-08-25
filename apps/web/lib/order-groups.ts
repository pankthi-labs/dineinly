export type GuestOrder = {
	id: string;
	number: number;
	status: "preparing" | "partially served" | "served";
	items: { name: string; quantity: number; served: boolean; ready: boolean }[];
};

// Full-Service (One): a "partially served" order renders as two group rows
// sharing the order number — one still Preparing, one already Served —
// merging back into a single row once every item reaches that state
// (docs/product.md: guest sees the derived order status, never per-item
// granularity, so status lives on the group, not the line). One order per
// round is the normal shape here, so the order number stays in the heading.
// Counter reuses this same shape (see counterOrderGroups below) but with no
// order number, since a session's orders are one payable unit, not rounds.
export type OrderGroup = {
	key: string;
	number: number | null;
	status: "preparing" | "done";
	items: { name: string; quantity: number }[];
};

export const GROUP_DOT_CLASS: Record<"preparing" | "done", string> = {
	preparing: "bg-warning",
	done: "bg-success",
};

export const GROUP_TEXT_CLASS: Record<"preparing" | "done", string> = {
	preparing: "text-warning",
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
// items into a single preparing/done split instead of one group per order —
// same status ladder and visual language as Full-Service, just no order
// number in the heading.
export function counterOrderGroups(orders: GuestOrder[]): OrderGroup[] {
	const items = orders.flatMap((order) => order.items);
	const preparing = items.filter((item) => !item.served);
	const done = items.filter((item) => item.served);
	const groups: OrderGroup[] = [];
	if (preparing.length > 0) {
		groups.push({
			key: "preparing",
			number: null,
			status: "preparing",
			items: preparing,
		});
	}
	if (done.length > 0) {
		groups.push({ key: "done", number: null, status: "done", items: done });
	}
	return groups;
}
