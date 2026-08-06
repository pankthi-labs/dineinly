import { describe, expect, it } from "vitest";
import { moveId, moveIdTo } from "@/lib/reorder";

describe("moveId", () => {
	it("swaps with the previous item when moving up", () => {
		expect(moveId(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
	});

	it("swaps with the next item when moving down", () => {
		expect(moveId(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
	});

	it("is a no-op at the top boundary", () => {
		expect(moveId(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
	});

	it("is a no-op at the bottom boundary", () => {
		expect(moveId(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
	});
});

describe("moveIdTo", () => {
	it("moves an id earlier in the list", () => {
		expect(moveIdTo(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
	});

	it("moves an id later in the list", () => {
		expect(moveIdTo(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
	});

	it("moves an id down onto its immediate neighbor", () => {
		expect(moveIdTo(["a", "b"], "a", "b")).toEqual(["b", "a"]);
	});

	it("is a no-op when dragged onto itself", () => {
		expect(moveIdTo(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
	});

	it("is a no-op for an id not in the list", () => {
		expect(moveIdTo(["a", "b", "c"], "z", "a")).toEqual(["a", "b", "c"]);
	});
});
