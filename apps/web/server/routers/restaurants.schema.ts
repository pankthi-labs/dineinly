import { z } from "zod";

// Pure zod, no server-only imports — safe for both the restaurants router
// and the client-side form (app/admin/restaurants) to import, so the two
// validate identically off one schema.

export const restaurantExperienceValues = [
	"menu",
	"guest",
	"counter",
	"one",
] as const;
export type RestaurantExperienceValue =
	(typeof restaurantExperienceValues)[number];

// Only One and Counter have Dineinly compute a bill (docs/product.md §
// Dineinly Experiences — Menu has no bill at all; Guest's billing is
// untouched, left to the restaurant's existing system). Address/GST/
// category tax only ever reach a bill header or its tax math, so they're
// pointless to ask for on the other two.
export function needsBillingDetails(
	experience: RestaurantExperienceValue,
): boolean {
	return experience === "one" || experience === "counter";
}

// Menu is the only experience that never takes an order (docs/product.md §
// Dineinly Experiences) — Guest/One/Counter all do, so a spice/salt/ice
// preference or a live order-status ladder has something to apply to.
export function isOrderingEnabled(
	experience: RestaurantExperienceValue,
): boolean {
	return experience !== "menu";
}

// Kept apart from restaurantFieldsSchema below so callers that need to
// .merge()/.extend() further (ownerContactSchema, an `id` field) can do so
// before applying refineBillingDetails — ZodEffects (what .superRefine()
// returns) doesn't support .merge()/.extend().
export const restaurantFieldsShape = z.object({
	name: z.string().trim().min(2).max(120),
	address: z.string().trim().max(240),
	city: z.string().trim().max(80),
	gstNumber: z.string().trim().toUpperCase().max(15),
	state: z.string().trim().max(60),
	pincode: z.string().trim().max(6),
	// Which Dineinly package this restaurant runs (docs/product.md § Dineinly
	// Experiences) — asked at creation, changeable via the same edit flow.
	experience: z.enum(restaurantExperienceValues),
});

export function refineBillingDetails(
	values: z.infer<typeof restaurantFieldsShape>,
	ctx: z.RefinementCtx,
): void {
	if (!needsBillingDetails(values.experience)) return;
	if (values.address.length < 5) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["address"],
			message: "Enter the full address.",
		});
	}
	if (values.city.length < 2) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["city"],
			message: "Enter a city.",
		});
	}
	if (!/^[0-9A-Z]{15}$/.test(values.gstNumber)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["gstNumber"],
			message: "Enter a valid 15-character GSTIN.",
		});
	}
	if (values.state.length < 2) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["state"],
			message: "Enter a state.",
		});
	}
	if (!/^\d{6}$/.test(values.pincode)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["pincode"],
			message: "Enter a valid 6-digit pincode.",
		});
	}
}

export const restaurantFieldsSchema =
	restaurantFieldsShape.superRefine(refineBillingDetails);

export const ownerContactSchema = z.object({
	ownerName: z.string().trim().min(2).max(80),
	ownerEmail: z.string().trim().toLowerCase().email(),
	// staff.mobile is nullable (docs/core-data-model.md § Staff) — a contact
	// detail, not a login factor (Owner auth is Email OTP), so it's optional
	// here too. Only validated against the format when actually provided.
	ownerMobile: z
		.string()
		.trim()
		.regex(/^\+?\d{7,15}$/, "Enter a valid mobile number.")
		.or(z.literal("")),
});

export const createRestaurantInput = restaurantFieldsShape
	.merge(ownerContactSchema)
	.superRefine(refineBillingDetails);

export const updateRestaurantInput = restaurantFieldsShape
	.merge(ownerContactSchema)
	.extend({ id: z.string().uuid() })
	.superRefine(refineBillingDetails);

// Venue Settings (docs/product.md § RBAC "Restaurant Settings" — Owner +
// Dineinly Admin only): same fields as updateRestaurantInput but never
// owner-contact — identity changes stay in Staff Roster.
export const updateOwnRestaurantInput = restaurantFieldsShape
	.extend({ id: z.string().uuid() })
	.superRefine(refineBillingDetails);

export const setRestaurantStatusInput = z.object({
	id: z.string().uuid(),
	status: z.enum(["active", "archived"]),
});

export const getRestaurantInput = z.object({
	id: z.string().uuid(),
});

export const listRestaurantsInput = z.object({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(50).default(10),
	search: z.string().trim().max(120).optional(),
});

export const getQrInput = z.object({
	restaurantId: z.string().uuid(),
});

export const downloadQrPdfInput = z.object({
	restaurantId: z.string().uuid(),
	origin: z.string().url(),
});

export type RestaurantFields = z.infer<typeof restaurantFieldsSchema>;
export type OwnerContact = z.infer<typeof ownerContactSchema>;
