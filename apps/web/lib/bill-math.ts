import { describeModifiers } from "@/lib/order-item-groups";

export type BillLineInput = {
	name: string;
	unitPrice: number;
	quantity: number;
	taxRate: number;
	// Preference chosen at order time (Order Item snapshot) — undefined/null
	// means "not asked" (menu item doesn't offer that preference). Part of
	// the merge key below: two rows only ever combine into one bill line
	// when every preference matches too, so "extra spicy" never silently
	// merges into a plain repeat of the same dish.
	spice?: string | null;
	salt?: string | null;
	ice?: string | null;
};

export type BillLine = {
	name: string;
	unitPrice: number;
	quantity: number;
	amount: number;
	// Non-default preferences only, e.g. "Extra Spicy, Less Salt" — null when
	// every preference on this line is unset or the restaurant's default
	// ("regular"), so a plain repeat order shows no tag at all.
	modifiers: string | null;
};

export type TaxSlab = {
	ratePercent: number;
	cgst: number;
	sgst: number;
};

export type BillTotals = {
	lines: BillLine[];
	subtotal: number;
	taxSlabs: TaxSlab[];
	total: number;
};

const toPaisa = (rupees: number) => Math.round(rupees * 100);

// Shared by every bill-math call site (staff list/detail/settle/PDF, guest
// bill) that reads order_items: the portion of quantity still billable after
// a Bills tab partial waive and/or partial cancel. 0 or negative means the
// whole line is excluded.
export function billableQuantity(
	quantity: number,
	waivedQuantity: number,
	cancelledQuantity = 0,
): number {
	return quantity - waivedQuantity - cancelledQuantity;
}

/**
 * All money math runs in integer paisa (round-half-up at each step, 2dp
 * final precision, no whole-rupee round-off line) to avoid floating-point
 * drift, then converts back to rupees at the end. Order Item rows are
 * merged into one bill line per (name, unit price, preferences) triple,
 * matching how a physical restaurant bill groups repeat orders of the same
 * dish — but a differently-customized repeat (e.g. extra spicy) stays its
 * own line rather than silently merging into the plain one.
 */
export function computeBill(rows: BillLineInput[]): BillTotals {
	const lineMap = new Map<string, BillLine & { unitPricePaisa: number }>();
	for (const row of rows) {
		const unitPricePaisa = toPaisa(row.unitPrice);
		const modifiers = describeModifiers(row.spice, row.salt, row.ice);
		const key = `${row.name}:${unitPricePaisa}:${modifiers ?? ""}`;
		const existing = lineMap.get(key);
		if (existing) {
			existing.quantity += row.quantity;
		} else {
			lineMap.set(key, {
				name: row.name,
				unitPrice: unitPricePaisa / 100,
				unitPricePaisa,
				quantity: row.quantity,
				amount: 0,
				modifiers,
			});
		}
	}
	const lines = [...lineMap.values()].map((line) => ({
		name: line.name,
		unitPrice: line.unitPrice,
		quantity: line.quantity,
		amount: (line.unitPricePaisa * line.quantity) / 100,
		modifiers: line.modifiers,
	}));

	const slabSubtotalPaisa = new Map<number, number>();
	for (const row of rows) {
		const amountPaisa = toPaisa(row.unitPrice) * row.quantity;
		slabSubtotalPaisa.set(
			row.taxRate,
			(slabSubtotalPaisa.get(row.taxRate) ?? 0) + amountPaisa,
		);
	}
	const subtotalPaisa = [...slabSubtotalPaisa.values()].reduce(
		(sum, paisa) => sum + paisa,
		0,
	);

	const taxSlabs: TaxSlab[] = [];
	let totalTaxPaisa = 0;
	for (const [rate, slabPaisa] of [...slabSubtotalPaisa.entries()].sort(
		(a, b) => a[0] - b[0],
	)) {
		if (rate <= 0) continue;
		const slabTaxPaisa = Math.round(slabPaisa * rate);
		const cgstPaisa = Math.round(slabTaxPaisa / 2);
		const sgstPaisa = slabTaxPaisa - cgstPaisa;
		totalTaxPaisa += slabTaxPaisa;
		taxSlabs.push({
			// tax_rate is numeric(5,4), so half of it as a percent carries at
			// most 3 decimals — rounding there keeps float round-trip noise
			// (0.28 -> 14.000000000000002) out of the guest-facing label.
			ratePercent: Math.round(rate * 50000) / 1000,
			cgst: cgstPaisa / 100,
			sgst: sgstPaisa / 100,
		});
	}

	const totalPaisa = subtotalPaisa + totalTaxPaisa;

	return {
		lines,
		subtotal: subtotalPaisa / 100,
		taxSlabs,
		total: totalPaisa / 100,
	};
}
