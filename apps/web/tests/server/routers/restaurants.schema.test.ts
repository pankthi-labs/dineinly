import { describe, expect, it } from "vitest";
import {
	createRestaurantInput,
	restaurantFieldsSchema,
} from "@/server/routers/restaurants.schema";

const validRestaurant = {
	name: "Obsidian Roast",
	address: "12 Kaikoukan Street, Shibuya",
	city: "Mumbai",
	gstNumber: "27ABCDE1234F1Z5",
	state: "Maharashtra",
	pincode: "400001",
	serviceChargePercent: 5,
};

const validAdmin = {
	adminName: "Kenji Sato",
	adminEmail: "k.sato@obsidianroast.com",
	adminMobile: "+819012345678",
};

describe("restaurantFieldsSchema", () => {
	it("accepts a fully valid restaurant", () => {
		expect(restaurantFieldsSchema.safeParse(validRestaurant).success).toBe(
			true,
		);
	});

	it("accepts a null service charge (restaurant levies none)", () => {
		expect(
			restaurantFieldsSchema.safeParse({
				...validRestaurant,
				serviceChargePercent: null,
			}).success,
		).toBe(true);
	});

	it("rejects a GST number that isn't 15 alphanumeric characters", () => {
		const result = restaurantFieldsSchema.safeParse({
			...validRestaurant,
			gstNumber: "not-a-gstin",
		});
		expect(result.success).toBe(false);
	});

	it("uppercases a lowercase GST number instead of rejecting it", () => {
		const result = restaurantFieldsSchema.safeParse({
			...validRestaurant,
			gstNumber: validRestaurant.gstNumber.toLowerCase(),
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.gstNumber).toBe(validRestaurant.gstNumber);
		}
	});

	it("rejects a pincode that isn't 6 digits", () => {
		expect(
			restaurantFieldsSchema.safeParse({ ...validRestaurant, pincode: "1234" })
				.success,
		).toBe(false);
	});

	it("rejects a service charge over 100%", () => {
		expect(
			restaurantFieldsSchema.safeParse({
				...validRestaurant,
				serviceChargePercent: 150,
			}).success,
		).toBe(false);
	});
});

describe("createRestaurantInput", () => {
	it("requires the admin contact fields alongside the restaurant fields", () => {
		expect(createRestaurantInput.safeParse(validRestaurant).success).toBe(
			false,
		);
		expect(
			createRestaurantInput.safeParse({ ...validRestaurant, ...validAdmin })
				.success,
		).toBe(true);
	});

	it("rejects an invalid admin email", () => {
		const result = createRestaurantInput.safeParse({
			...validRestaurant,
			...validAdmin,
			adminEmail: "not-an-email",
		});
		expect(result.success).toBe(false);
	});
});
