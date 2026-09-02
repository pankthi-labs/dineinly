import { describe, expect, it } from "vitest";
import { groupOrderItems } from "@/lib/order-item-groups";

function line(
	overrides: Partial<Parameters<typeof groupOrderItems>[0][number]> = {},
) {
	return {
		id: "1",
		name: "Dosa",
		unitPrice: 100,
		quantity: 1,
		waivedQuantity: 0,
		cancelledQuantity: 0,
		spice: null,
		salt: null,
		ice: null,
		cancellable: true,
		waivable: true,
		releasable: false,
		...overrides,
	};
}

describe("groupOrderItems", () => {
	it("merges repeat rows of the same dish + preferences, summing quantity/waived/cancelled", () => {
		const groups = groupOrderItems([
			line({ id: "1", quantity: 2 }),
			line({ id: "2", quantity: 1, waivedQuantity: 1 }),
		]);
		expect(groups).toEqual([
			{
				key: "Dosa:100:",
				name: "Dosa",
				unitPrice: 100,
				modifiers: null,
				quantity: 3,
				waivedQuantity: 1,
				cancelledQuantity: 0,
				cancellable: true,
				waivable: true,
				itemIds: ["1", "2"],
				activeItemId: "2",
				releasableItemIds: [],
			},
		]);
	});

	it("collects every releasable underlying row, not just the active one", () => {
		const groups = groupOrderItems([
			line({ id: "1", releasable: true }),
			line({ id: "2", releasable: true }),
			line({ id: "3", releasable: false }),
		]);
		expect(groups[0]?.releasableItemIds).toEqual(["1", "2"]);
	});

	it("keeps a differently-customized repeat as its own group", () => {
		const groups = groupOrderItems([
			line({ id: "1" }),
			line({ id: "2", spice: "extra spicy" }),
		]);
		expect(groups.map((g) => g.key)).toEqual([
			"Dosa:100:",
			"Dosa:100:Extra Spicy",
		]);
		expect(groups.map((g) => g.itemIds)).toEqual([["1"], ["2"]]);
	});

	it("picks the newest still-correctable row as the correction target", () => {
		const groups = groupOrderItems([
			line({ id: "1", cancellable: false, waivable: false }),
			line({ id: "2" }),
		]);
		expect(groups[0]?.activeItemId).toBe("2");
	});

	it("keeps a placed row as the correction target even when a later, non-placed row merges in", () => {
		// id "1" is still placed (pill-correctable); id "2" already moved past
		// that (preparing/served) but stays waivable. The group must still
		// target the placed row, not silently fall back to the newer one.
		const groups = groupOrderItems([
			line({ id: "1", cancellable: true }),
			line({ id: "2", cancellable: false, waivable: true }),
		]);
		expect(groups[0]?.activeItemId).toBe("1");
		expect(groups[0]?.cancellable).toBe(true);
	});

	it("picks a placed row as the target even when it merges in after a non-placed row", () => {
		const groups = groupOrderItems([
			line({ id: "1", cancellable: false, waivable: true }),
			line({ id: "2", cancellable: true }),
		]);
		expect(groups[0]?.activeItemId).toBe("2");
	});
});
