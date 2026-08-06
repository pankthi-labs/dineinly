import { describe, expect, it } from "vitest";
import { menuItemInputSchema } from "@/server/routers/menu";

const validItem = {
	restaurantId: "10000000-0000-4000-8000-000000000001",
	categoryId: "30000000-0000-4000-8000-000000000001",
	name: "Paneer Butter Masala",
	description: "Cottage cheese in a creamy tomato gravy.",
	price: 320,
	prepTime: "15-20 mins",
	servingSize: "serves 2",
	diet: "veg",
	availability: "available",
	labels: ["chef special"],
	offersSpice: true,
	offersSalt: false,
	offersIce: false,
	status: "active",
};

describe("menuItemInputSchema", () => {
	it("accepts a fully valid dish", () => {
		expect(menuItemInputSchema.safeParse(validItem).success).toBe(true);
	});

	it("rejects a prep time outside the fixed bucket list", () => {
		const result = menuItemInputSchema.safeParse({
			...validItem,
			prepTime: "20 mins",
		});
		expect(result.success).toBe(false);
	});

	it("rejects a serving size outside the fixed option list", () => {
		const result = menuItemInputSchema.safeParse({
			...validItem,
			servingSize: "serves 1 (12 pcs)",
		});
		expect(result.success).toBe(false);
	});

	it("rejects more than one label", () => {
		const result = menuItemInputSchema.safeParse({
			...validItem,
			labels: ["chef special", "bestseller"],
		});
		expect(result.success).toBe(false);
	});
});
