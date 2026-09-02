import { describe, expect, it } from "vitest";
import {
	counterOrderGroups,
	type GuestOrder,
	orderGroups,
} from "@/lib/order-groups";

function order(overrides: Partial<GuestOrder> = {}): GuestOrder {
	return {
		id: "order-1",
		number: 1,
		status: "preparing",
		items: [],
		...overrides,
	};
}

function item(overrides: Partial<GuestOrder["items"][number]> = {}) {
	return {
		id: "item-1",
		name: "Dosa",
		quantity: 1,
		spice: null,
		salt: null,
		ice: null,
		served: false,
		ready: false,
		released: true,
		...overrides,
	};
}

// Expected shape of a merged OrderGroup line (apps/web/lib/order-groups.ts
// mergeByDish) for a single underlying item — every existing test case below
// merges exactly one item per bucket, so ids is always a single-element array.
function groupItem({
	id = "item-1",
	name = "Dosa",
	quantity = 1,
	modifiers = null,
}: {
	id?: string;
	name?: string;
	quantity?: number;
	modifiers?: string | null;
} = {}) {
	return {
		key: `${name}:${modifiers ?? ""}`,
		ids: [id],
		name,
		modifiers,
		quantity,
	};
}

describe("orderGroups", () => {
	it("splits one order into preparing/served groups, keeping the order number", () => {
		const groups = orderGroups(
			order({
				items: [
					item({ id: "1", name: "Dosa", served: false, ready: true }),
					item({
						id: "2",
						name: "Coffee",
						quantity: 2,
						served: true,
						ready: true,
					}),
				],
			}),
		);
		expect(groups).toEqual([
			{
				key: "order-1-preparing",
				number: 1,
				status: "preparing",
				items: [groupItem({ id: "1", name: "Dosa" })],
			},
			{
				key: "order-1-done",
				number: 1,
				status: "done",
				items: [groupItem({ id: "2", name: "Coffee", quantity: 2 })],
			},
		]);
	});
});

describe("counterOrderGroups", () => {
	it("flattens every order's released items into one preparing/done split with no order number", () => {
		const groups = counterOrderGroups([
			order({
				id: "a",
				items: [item({ id: "1", name: "Dosa", served: false, ready: false })],
			}),
			order({
				id: "b",
				items: [
					item({
						id: "2",
						name: "Coffee",
						quantity: 2,
						served: true,
						ready: true,
					}),
				],
			}),
		]);
		expect(groups).toEqual([
			{
				key: "preparing",
				number: null,
				status: "preparing",
				items: [groupItem({ id: "1", name: "Dosa" })],
			},
			{
				key: "done",
				number: null,
				status: "done",
				items: [groupItem({ id: "2", name: "Coffee", quantity: 2 })],
			},
		]);
	});

	it("omits a bucket entirely once every item has moved past it", () => {
		const groups = counterOrderGroups([
			order({
				items: [item({ served: true, ready: true })],
			}),
		]);
		expect(groups.map((group) => group.status)).toEqual(["done"]);
	});

	it("puts a released, ready-but-not-served item in its own ready bucket", () => {
		const groups = counterOrderGroups([
			order({
				items: [
					item({ id: "1", name: "Dosa", ready: true, served: false }),
					item({ id: "2", name: "Coffee", ready: false, served: false }),
				],
			}),
		]);
		expect(groups).toEqual([
			{
				key: "preparing",
				number: null,
				status: "preparing",
				items: [groupItem({ id: "2", name: "Coffee" })],
			},
			{
				key: "ready",
				number: null,
				status: "ready",
				items: [groupItem({ id: "1", name: "Dosa" })],
			},
		]);
	});

	it("groups an unreleased item separately, regardless of its status", () => {
		const groups = counterOrderGroups([
			order({
				items: [
					item({ id: "1", name: "Dosa", released: false }),
					item({ id: "2", name: "Coffee", released: true, served: true }),
				],
			}),
		]);
		expect(groups).toEqual([
			{
				key: "unsent",
				number: null,
				status: "unsent",
				items: [groupItem({ id: "1", name: "Dosa" })],
			},
			{
				key: "done",
				number: null,
				status: "done",
				items: [groupItem({ id: "2", name: "Coffee" })],
			},
		]);
	});

	it("merges repeat orders of the same dish + preferences into one line", () => {
		const groups = counterOrderGroups([
			order({
				id: "a",
				items: [item({ id: "1", name: "Dosa", released: false })],
			}),
			order({
				id: "b",
				items: [
					item({ id: "2", name: "Dosa", released: false, quantity: 2 }),
					item({
						id: "3",
						name: "Dosa",
						released: false,
						spice: "extra spicy",
					}),
				],
			}),
		]);
		expect(groups).toEqual([
			{
				key: "unsent",
				number: null,
				status: "unsent",
				items: [
					{
						key: "Dosa:",
						ids: ["1", "2"],
						name: "Dosa",
						modifiers: null,
						quantity: 3,
					},
					{
						key: "Dosa:Extra Spicy",
						ids: ["3"],
						name: "Dosa",
						modifiers: "Extra Spicy",
						quantity: 1,
					},
				],
			},
		]);
	});
});
