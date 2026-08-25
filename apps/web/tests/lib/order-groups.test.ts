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

describe("orderGroups", () => {
	it("splits one order into preparing/served groups, keeping the order number", () => {
		const groups = orderGroups(
			order({
				items: [
					{ name: "Dosa", quantity: 1, served: false, ready: true },
					{ name: "Coffee", quantity: 2, served: true, ready: true },
				],
			}),
		);
		expect(groups).toEqual([
			{
				key: "order-1-preparing",
				number: 1,
				status: "preparing",
				items: [{ name: "Dosa", quantity: 1, served: false, ready: true }],
			},
			{
				key: "order-1-done",
				number: 1,
				status: "done",
				items: [{ name: "Coffee", quantity: 2, served: true, ready: true }],
			},
		]);
	});
});

describe("counterOrderGroups", () => {
	it("flattens every order's items into one preparing/done split with no order number", () => {
		const groups = counterOrderGroups([
			order({
				id: "a",
				items: [{ name: "Dosa", quantity: 1, served: false, ready: false }],
			}),
			order({
				id: "b",
				items: [{ name: "Coffee", quantity: 2, served: true, ready: true }],
			}),
		]);
		expect(groups).toEqual([
			{
				key: "preparing",
				number: null,
				status: "preparing",
				items: [{ name: "Dosa", quantity: 1, served: false, ready: false }],
			},
			{
				key: "done",
				number: null,
				status: "done",
				items: [{ name: "Coffee", quantity: 2, served: true, ready: true }],
			},
		]);
	});

	it("omits a bucket entirely once every item has moved past it", () => {
		const groups = counterOrderGroups([
			order({
				items: [{ name: "Coffee", quantity: 1, served: true, ready: true }],
			}),
		]);
		expect(groups.map((group) => group.status)).toEqual(["done"]);
	});
});
