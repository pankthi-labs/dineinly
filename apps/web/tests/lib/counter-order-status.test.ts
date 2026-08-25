import { describe, expect, it } from "vitest";
import { counterOrderStatus } from "@/lib/counter-order-status";

describe("counterOrderStatus", () => {
	it("is awaiting payment before the bill settles, regardless of item state", () => {
		expect(counterOrderStatus([{ served: false, ready: true }], false)).toBe(
			"awaiting",
		);
	});

	it("is preparing once settled but not every item is done", () => {
		expect(
			counterOrderStatus(
				[
					{ served: false, ready: false },
					{ served: true, ready: false },
				],
				true,
			),
		).toBe("preparing");
	});

	it("is done once settled and every item is served or ready", () => {
		expect(
			counterOrderStatus(
				[
					{ served: true, ready: false },
					{ served: false, ready: true },
				],
				true,
			),
		).toBe("done");
	});
});
