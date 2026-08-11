export type KitchenQueueItem = {
	id: string;
	dish: string;
	quantity: number;
	status: "placed" | "preparing" | "ready";
	placedAt: string | null;
	preparingAt: string | null;
	readyAt: string | null;
	tables: string[];
};

export type KitchenBatch = {
	key: string;
	dish: string;
	status: KitchenQueueItem["status"];
	quantity: number;
	elapsedMinutes: number;
	timeLabel: string;
	tables: { label: string; quantity: number }[];
	overdue: boolean;
	orderItemIds: string[];
};

// Matches the reference Kitchen Display mock — no ops-defined SLA exists
// yet to derive this from (docs/product.md has none), so it's a fixed
// display threshold, not a stored business rule.
const OVERDUE_MINUTES = 8;

// design-system.md §05: stagger cap 3 items, 40ms each, 120ms total.
const STAGGER_STEP_MS = 40;
const STAGGER_CAP = 3;

// Each status measures a different clock: how long since the order was
// placed (Incoming — nothing has happened yet, so placedAt is the only
// timestamp that exists), how long it's actually been in the pan
// (Preparing — preparingAt, stamped when the kitchen started it), how long
// it's sat waiting for a waiter to collect it (Ready — readyAt). Falls back
// to placedAt for any row missing its preparingAt/readyAt timestamp.
function referenceTimestamp(item: KitchenQueueItem): string | null {
	if (item.status === "ready") return item.readyAt ?? item.placedAt;
	if (item.status === "preparing") return item.preparingAt ?? item.placedAt;
	return item.placedAt;
}

function timeSentence(
	status: KitchenQueueItem["status"],
	minutes: number,
): string {
	if (status === "placed") {
		return minutes <= 0 ? "Just placed" : `Waiting ${minutes}m to start`;
	}
	if (status === "preparing") {
		return minutes <= 0 ? "Just started" : `Preparing for ${minutes}m`;
	}
	return minutes <= 0 ? "Just plated" : `Waiting ${minutes}m for pickup`;
}

/**
 * Groups a status's flat order items into dish batches — items across
 * different orders/tables that share a dish name and status render (and
 * advance) as one card, mirroring how the kitchen actually fires a dish.
 * Sorted oldest-first so the longest-waiting batch surfaces at the top.
 */
export function batchQueueItems(items: KitchenQueueItem[]): KitchenBatch[] {
	const byDish = new Map<
		string,
		{ status: KitchenQueueItem["status"]; group: KitchenQueueItem[] }
	>();
	for (const item of items) {
		const entry = byDish.get(item.dish);
		if (entry) {
			entry.group.push(item);
		} else {
			byDish.set(item.dish, { status: item.status, group: [item] });
		}
	}

	const now = Date.now();
	const batches = [...byDish.entries()].map(([dish, { status, group }]) => {
		const referenceTimes = group
			.map((item) => referenceTimestamp(item))
			.map((iso) => (iso ? new Date(iso).getTime() : now))
			.filter((time) => !Number.isNaN(time));
		const oldestReferenceTime =
			referenceTimes.length > 0 ? Math.min(...referenceTimes) : now;
		const elapsedMinutes = Math.max(
			0,
			Math.floor((now - oldestReferenceTime) / 60000),
		);

		const tableTotals = new Map<string, number>();
		for (const item of group) {
			for (const label of item.tables) {
				tableTotals.set(label, (tableTotals.get(label) ?? 0) + item.quantity);
			}
		}

		return {
			key: `${status}-${dish}`,
			dish,
			status,
			quantity: group.reduce((sum, item) => sum + item.quantity, 0),
			elapsedMinutes,
			timeLabel: timeSentence(status, elapsedMinutes),
			tables: [...tableTotals.entries()].map(([label, quantity]) => ({
				label,
				quantity,
			})),
			overdue: status === "preparing" && elapsedMinutes >= OVERDUE_MINUTES,
			orderItemIds: group.map((item) => item.id),
		};
	});

	return batches.sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);
}

export function staggerDelayMs(index: number): number {
	return Math.min(index, STAGGER_CAP - 1) * STAGGER_STEP_MS;
}
