import { describe, expect, it } from "vitest";
import { computeBill } from "@/lib/bill-math";

describe("computeBill", () => {
	it("matches the reference bill: merged lines, CGST/SGST split", () => {
		const result = computeBill([
			{
				name: "Truffle Risotto",
				unitPrice: 1400,
				quantity: 1,
				taxRate: 0.05,
			},
			{
				name: "Truffle Risotto",
				unitPrice: 1400,
				quantity: 1,
				taxRate: 0.05,
			},
			{
				name: "Truffle Risotto",
				unitPrice: 1400,
				quantity: 1,
				taxRate: 0.05,
			},
			{
				name: "Pinot Noir Glass",
				unitPrice: 800,
				quantity: 1,
				taxRate: 0.05,
			},
			{ name: "Burrata Salad", unitPrice: 650, quantity: 1, taxRate: 0.05 },
		]);

		expect(result.lines).toEqual([
			{
				name: "Truffle Risotto",
				unitPrice: 1400,
				quantity: 3,
				amount: 4200,
				modifiers: null,
			},
			{
				name: "Pinot Noir Glass",
				unitPrice: 800,
				quantity: 1,
				amount: 800,
				modifiers: null,
			},
			{
				name: "Burrata Salad",
				unitPrice: 650,
				quantity: 1,
				amount: 650,
				modifiers: null,
			},
		]);
		expect(result.subtotal).toBe(5650);
		expect(result.taxSlabs).toEqual([
			{ ratePercent: 2.5, cgst: 141.25, sgst: 141.25 },
		]);
		expect(result.total).toBe(5932.5);
	});

	it("splits multiple tax rates into separate slabs", () => {
		const result = computeBill([
			{ name: "Cola", unitPrice: 100, quantity: 2, taxRate: 0.18 },
			{ name: "Fries", unitPrice: 200, quantity: 1, taxRate: 0.05 },
		]);

		expect(result.taxSlabs).toEqual([
			{ ratePercent: 2.5, cgst: 5, sgst: 5 },
			{ ratePercent: 9, cgst: 18, sgst: 18 },
		]);
		expect(result.subtotal).toBe(400);
		expect(result.total).toBe(446);
	});

	it("keeps CGST/SGST halves summing exactly to the slab tax on an odd paisa", () => {
		// 999 * 0.05 = 49.95 -> 4995 paisa, an odd number: halves must still add up.
		const result = computeBill([
			{ name: "Item", unitPrice: 999, quantity: 1, taxRate: 0.05 },
		]);
		const total = result.taxSlabs.reduce(
			(sum, slab) => sum + slab.cgst + slab.sgst,
			0,
		);
		expect(total).toBeCloseTo(49.95, 5);
	});

	it("keeps the half-slab percent free of float round-trip noise", () => {
		const result = computeBill([
			{ name: "Item", unitPrice: 100, quantity: 1, taxRate: 0.28 },
		]);
		expect(result.taxSlabs).toEqual([{ ratePercent: 14, cgst: 14, sgst: 14 }]);
	});

	it("keeps a differently-customized repeat as its own line, but merges an identical repeat", () => {
		const result = computeBill([
			{ name: "Dosa", unitPrice: 100, quantity: 1, taxRate: 0.05 },
			{
				name: "Dosa",
				unitPrice: 100,
				quantity: 1,
				taxRate: 0.05,
				spice: "extra spicy",
			},
			{
				name: "Dosa",
				unitPrice: 100,
				quantity: 2,
				taxRate: 0.05,
				spice: "regular",
			},
		]);

		expect(result.lines).toEqual([
			{
				name: "Dosa",
				unitPrice: 100,
				quantity: 3,
				amount: 300,
				modifiers: null,
			},
			{
				name: "Dosa",
				unitPrice: 100,
				quantity: 1,
				amount: 100,
				modifiers: "Extra Spicy",
			},
		]);
	});

	it("omits a zero-rate slab", () => {
		const result = computeBill([
			{ name: "Water", unitPrice: 50, quantity: 1, taxRate: 0 },
		]);
		expect(result.taxSlabs).toEqual([]);
		expect(result.total).toBe(50);
	});
});
