import { describe, expect, it } from "vitest";
import { pdfSafe } from "@/lib/bill-pdf";

describe("pdfSafe", () => {
	it("keeps characters Helvetica's WinAnsi encoding covers", () => {
		expect(pdfSafe("Table 12 - Café")).toBe("Table 12 - Café");
	});

	it("replaces characters that would throw at draw time", () => {
		expect(pdfSafe("₹450")).toBe("?450");
		expect(pdfSafe("टेबल 1")).toBe("???? 1");
	});
});
