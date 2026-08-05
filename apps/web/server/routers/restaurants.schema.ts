import { z } from "zod";

// Pure zod, no server-only imports — safe for both the restaurants router
// and the client-side form (app/admin/restaurants) to import, so the two
// validate identically off one schema.

export const restaurantFieldsSchema = z.object({
	name: z.string().trim().min(2).max(120),
	address: z.string().trim().min(5).max(240),
	city: z.string().trim().min(2).max(80),
	gstNumber: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[0-9A-Z]{15}$/, "Enter a valid 15-character GSTIN."),
	state: z.string().trim().min(2).max(60),
	pincode: z
		.string()
		.trim()
		.regex(/^\d{6}$/, "Enter a valid 6-digit pincode."),
	// Percent (0-100) at the edge — restaurants.service_charge_rate stores
	// the 0-1 fraction; converted at the router boundary, never in the UI.
	serviceChargePercent: z.number().min(0).max(100).nullable(),
});

export const ownerContactSchema = z.object({
	ownerName: z.string().trim().min(2).max(80),
	ownerEmail: z.string().trim().toLowerCase().email(),
	ownerMobile: z
		.string()
		.trim()
		.regex(/^\+?\d{7,15}$/, "Enter a valid mobile number."),
});

export const createRestaurantInput =
	restaurantFieldsSchema.merge(ownerContactSchema);

export const updateRestaurantInput = restaurantFieldsSchema
	.merge(ownerContactSchema)
	.extend({ id: z.string().uuid() });

export const setRestaurantStatusInput = z.object({
	id: z.string().uuid(),
	status: z.enum(["active", "archived"]),
});

export const listRestaurantsInput = z.object({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(50).default(10),
	search: z.string().trim().max(120).optional(),
});

export type RestaurantFields = z.infer<typeof restaurantFieldsSchema>;
export type OwnerContact = z.infer<typeof ownerContactSchema>;
