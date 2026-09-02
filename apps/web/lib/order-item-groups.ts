export type CorrectableOrderItem = {
	id: string;
	name: string;
	unitPrice: number;
	quantity: number;
	waivedQuantity: number;
	cancelledQuantity: number;
	spice: string | null;
	salt: string | null;
	ice: string | null;
	cancellable: boolean;
	waivable: boolean;
	// Counter only: staff safety-net release (bills.releaseOrderItem) — true
	// for a still-`placed`, not-yet-guest-released item.
	releasable: boolean;
};

export type OrderItemGroup = {
	key: string;
	name: string;
	unitPrice: number;
	modifiers: string | null;
	quantity: number;
	waivedQuantity: number;
	cancelledQuantity: number;
	cancellable: boolean;
	waivable: boolean;
	// Underlying order_item rows this group combines, oldest first — a
	// correction (waive/cancel/quantity edit) always targets one specific
	// row (activeItemId below), never the merged total, since each row is
	// its own DB record with its own remaining quantity to correct.
	itemIds: string[];
	// The row a correction acts on: the most recently added row that still
	// has something left to correct, so editing a merged line adjusts the
	// newest addition first rather than reopening an earlier, already
	// corrected round.
	activeItemId: string;
	// Every underlying row still eligible for the release safety-net — unlike
	// waive/cancel/quantity, releasing isn't a bounded correction on one row,
	// so one tap sends every matching id in the merged line, not just
	// activeItemId.
	releasableItemIds: string[];
};

// "regular" is every preference's own default (packages/db/src/schema/
// enums.ts) — worth calling out only when it deviates from that.
export function describeModifiers(
	spice?: string | null,
	salt?: string | null,
	ice?: string | null,
): string | null {
	const parts = [spice, salt, ice].filter(
		(value): value is string => !!value && value !== "regular",
	);
	if (parts.length === 0) return null;
	return parts
		.map((part) => part.replace(/\b\w/g, (c) => c.toUpperCase()))
		.join(", ");
}

/**
 * Merges order_item rows that repeat the same dish + preferences (e.g. two
 * separate confirm-cart rounds against the same still-open bill) into one
 * displayed line, the same way the guest-facing bill and the Kitchen
 * Display's dish batches already do — a differently-customized repeat
 * stays its own group. Corrections still act on a single underlying row
 * (activeItemId), never the merged total.
 */
export function groupOrderItems(
	items: CorrectableOrderItem[],
): OrderItemGroup[] {
	const groups = new Map<string, OrderItemGroup>();
	for (const item of items) {
		const modifiers = describeModifiers(item.spice, item.salt, item.ice);
		const key = `${item.name}:${item.unitPrice}:${modifiers ?? ""}`;
		const existing = groups.get(key);
		if (existing) {
			existing.quantity += item.quantity;
			existing.waivedQuantity += item.waivedQuantity;
			existing.cancelledQuantity += item.cancelledQuantity;
			existing.itemIds.push(item.id);
			// A still-`placed` row is what the quantity pill/cancel act on
			// (bills.ts's setOrderItemQuantity/cancelOrderItem both gate on
			// status = 'placed'); once the group has one, activeItemId must keep
			// pointing at a placed row, never fall back to a later-stage
			// (preparing/ready/served) row just because it's waivable too —
			// otherwise the pill shows a mixed total but a tap on it 404s
			// against a row that was never placed-only in the first place.
			if (item.cancellable) {
				existing.activeItemId = item.id;
			} else if (item.waivable && !existing.cancellable) {
				existing.activeItemId = item.id;
			}
			existing.cancellable = existing.cancellable || item.cancellable;
			existing.waivable = existing.waivable || item.waivable;
			if (item.releasable) {
				existing.releasableItemIds.push(item.id);
			}
		} else {
			groups.set(key, {
				key,
				name: item.name,
				unitPrice: item.unitPrice,
				modifiers,
				quantity: item.quantity,
				waivedQuantity: item.waivedQuantity,
				cancelledQuantity: item.cancelledQuantity,
				cancellable: item.cancellable,
				waivable: item.waivable,
				itemIds: [item.id],
				activeItemId: item.id,
				releasableItemIds: item.releasable ? [item.id] : [],
			});
		}
	}
	return [...groups.values()];
}
