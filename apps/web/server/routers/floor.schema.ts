import { z } from "zod";
import { ICE_OPTIONS, SALT_OPTIONS, SPICE_OPTIONS } from "@/lib/menu-options";

// Pure zod, no server-only imports — mirrors tables.schema.ts/bills.schema.ts.
// Staff cart/order procedures always carry restaurantId + sessionId
// explicitly (unlike guest.ts, which reads both off the guest's own JWT
// claims) — a staff caller acts on any session in their restaurant, not
// just one bound to their own token.

const restaurantIdSchema = z.string().uuid();
const sessionIdSchema = z.string().uuid();

const preferencesInput = z.object({
	spice: z.enum(SPICE_OPTIONS).nullish(),
	salt: z.enum(SALT_OPTIONS).nullish(),
	ice: z.enum(ICE_OPTIONS).nullish(),
});

export const listCartInput = z.object({
	restaurantId: restaurantIdSchema,
	sessionId: sessionIdSchema,
});

export const listGuestOrdersInput = z.object({
	restaurantId: restaurantIdSchema,
});

export const addCartItemInput = preferencesInput.extend({
	restaurantId: restaurantIdSchema,
	sessionId: sessionIdSchema,
	menuItemId: z.string().uuid(),
	quantity: z.number().int().min(1).max(99),
});

export const setCartItemQuantityInput = z.object({
	restaurantId: restaurantIdSchema,
	sessionId: sessionIdSchema,
	cartItemId: z.string().uuid(),
	quantity: z.number().int().min(0).max(99),
});

export const removeCartItemInput = z.object({
	restaurantId: restaurantIdSchema,
	sessionId: sessionIdSchema,
	cartItemId: z.string().uuid(),
});

export const submitFloorOrderInput = z.object({
	restaurantId: restaurantIdSchema,
	sessionId: sessionIdSchema,
	idempotencyKey: z.string().uuid(),
});
