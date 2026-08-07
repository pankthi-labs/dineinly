import { z } from "zod";
import { PREP_TIME_OPTIONS, SERVING_SIZE_OPTIONS } from "./menu-options";

// Shared by the server mutation (apps/web/server/routers/menu.ts) and the
// Add/Edit Dish forms, so client-side validation can never drift from what
// the server actually enforces.
export const menuItemInputSchema = z.object({
	restaurantId: z.string().uuid(),
	categoryId: z.string().uuid({ message: "Choose a category." }),
	name: z.string().trim().min(1, "Enter a dish name."),
	description: z.string().trim().min(1, "Enter a description."),
	price: z.number().finite().nonnegative("Enter a valid non-negative price."),
	prepTime: z.enum(PREP_TIME_OPTIONS, {
		message: "Choose a preparation time.",
	}),
	servingSize: z.enum(SERVING_SIZE_OPTIONS, {
		message: "Choose a serving size.",
	}),
	diet: z.enum(["veg", "non_veg"], { message: "Choose a dietary type." }),
	availability: z.enum(["available", "sold_out"]),
	labels: z.array(z.string().trim().min(1)).max(1),
	offersSpice: z.boolean(),
	offersSalt: z.boolean(),
	offersIce: z.boolean(),
	status: z.enum(["active", "archived"]),
});

/** First validation issue's message, for display above the form. */
export function firstFormError(error: z.ZodError): string {
	return error.issues[0]?.message ?? "Check the dish details.";
}
