import { describe, expect, it } from "vitest";
import {
	createRestaurantInput,
	getCounterQrInput,
	restaurantFieldsSchema,
	updateOwnRestaurantInput,
} from "@/server/routers/restaurants.schema";

const validRestaurant = {
	name: "Obsidian Roast",
	address: "12 Kaikoukan Street, Shibuya",
	city: "Mumbai",
	gstNumber: "27ABCDE1234F1Z5",
	state: "Maharashtra",
	pincode: "400001",
	serviceChargePercent: 5,
	experience: "one",
};

const validOwner = {
	ownerName: "Kenji Sato",
	ownerEmail: "k.sato@obsidianroast.com",
	ownerMobile: "+819012345678",
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
	it("requires the owner contact fields alongside the restaurant fields", () => {
		expect(createRestaurantInput.safeParse(validRestaurant).success).toBe(
			false,
		);
		expect(
			createRestaurantInput.safeParse({ ...validRestaurant, ...validOwner })
				.success,
		).toBe(true);
	});

	it("rejects an invalid owner email", () => {
		const result = createRestaurantInput.safeParse({
			...validRestaurant,
			...validOwner,
			ownerEmail: "not-an-email",
		});
		expect(result.success).toBe(false);
	});
});

describe("updateOwnRestaurantInput", () => {
	it("requires an id but no owner-contact fields", () => {
		expect(
			updateOwnRestaurantInput.safeParse({
				...validRestaurant,
				id: "8400b6ac-3f4b-4b1a-9c1a-2a2b6c9d0a11",
			}).success,
		).toBe(true);
	});

	it("rejects a missing id", () => {
		expect(updateOwnRestaurantInput.safeParse(validRestaurant).success).toBe(
			false,
		);
	});
});

describe("getCounterQrInput", () => {
	it("accepts a valid restaurant id", () => {
		expect(
			getCounterQrInput.safeParse({ restaurantId: crypto.randomUUID() })
				.success,
		).toBe(true);
	});

	it("rejects a non-uuid restaurant id", () => {
		expect(getCounterQrInput.safeParse({ restaurantId: "nope" }).success).toBe(
			false,
		);
	});
});
