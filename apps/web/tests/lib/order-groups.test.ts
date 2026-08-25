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
		served: false,
		ready: false,
		released: true,
		...overrides,
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
				items: [item({ id: "1", name: "Dosa", served: false, ready: true })],
			},
			{
				key: "order-1-done",
				number: 1,
				status: "done",
				items: [
					item({
						id: "2",
						name: "Coffee",
						quantity: 2,
						served: true,
						ready: true,
					}),
				],
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
				items: [item({ id: "1", name: "Dosa", served: false, ready: false })],
			},
			{
				key: "done",
				number: null,
				status: "done",
				items: [
					item({
						id: "2",
						name: "Coffee",
						quantity: 2,
						served: true,
						ready: true,
					}),
				],
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
				items: [item({ id: "2", name: "Coffee", ready: false, served: false })],
			},
			{
				key: "ready",
				number: null,
				status: "ready",
				items: [item({ id: "1", name: "Dosa", ready: true, served: false })],
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
				items: [item({ id: "1", name: "Dosa", released: false })],
			},
			{
				key: "done",
				number: null,
				status: "done",
				items: [
					item({ id: "2", name: "Coffee", released: true, served: true }),
				],
			},
		]);
	});
});
