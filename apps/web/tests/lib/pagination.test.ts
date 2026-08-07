import { describe, expect, it } from "vitest";
import { getPageRange } from "@/lib/pagination";

describe("getPageRange", () => {
	it("returns every page when the total fits without windowing", () => {
		expect(getPageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
	});

	it("windows around the current page with both ellipses", () => {
		expect(getPageRange(10, 20)).toEqual([
			1,
			"ellipsis",
			9,
			10,
			11,
			"ellipsis",
			20,
		]);
	});

	it("omits the left ellipsis near the start", () => {
		expect(getPageRange(2, 20)).toEqual([1, 2, 3, "ellipsis", 20]);
	});

	it("omits the right ellipsis near the end", () => {
		expect(getPageRange(19, 20)).toEqual([1, "ellipsis", 18, 19, 20]);
	});

	it("returns nothing for zero pages", () => {
		expect(getPageRange(1, 0)).toEqual([]);
	});
});
