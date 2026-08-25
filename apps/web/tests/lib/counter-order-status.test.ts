import { describe, expect, it } from "vitest";
import { counterOrderStatus } from "@/lib/counter-order-status";

describe("counterOrderStatus", () => {
	it("is awaiting payment before the bill settles, regardless of item state", () => {
		expect(
			counterOrderStatus(
				[{ released: false, served: false, ready: true }],
				false,
			),
		).toBe("awaiting");
	});

	it("is unsent once settled but nothing has been released to the kitchen yet", () => {
		expect(
			counterOrderStatus(
				[{ released: false, served: false, ready: false }],
				true,
			),
		).toBe("unsent");
	});

	it("is preparing once something is released but not everything is done", () => {
		expect(
			counterOrderStatus(
				[
					{ released: true, served: false, ready: false },
					{ released: true, served: true, ready: false },
				],
				true,
			),
		).toBe("preparing");
	});

	it("is preparing when a released item is done but another is still unsent", () => {
		expect(
			counterOrderStatus(
				[
					{ released: true, served: true, ready: false },
					{ released: false, served: false, ready: false },
				],
				true,
			),
		).toBe("preparing");
	});

	it("is ready once every item is released and done, but not all picked up yet", () => {
		expect(
			counterOrderStatus(
				[
					{ released: true, served: true, ready: false },
					{ released: true, served: false, ready: true },
				],
				true,
			),
		).toBe("ready");
	});

	it("is done once settled and every item is released and served", () => {
		expect(
			counterOrderStatus(
				[
					{ released: true, served: true, ready: false },
					{ released: true, served: true, ready: false },
				],
				true,
			),
		).toBe("done");
	});
});
