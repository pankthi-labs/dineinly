import { z } from "zod";

// Pure zod, no server-only imports — mirrors tables.schema.ts so the bills
// router and its client-side pages (app/restaurants/[restaurantId]/bills)
// validate identically off one schema.

const restaurantIdSchema = z.string().uuid();
const sessionIdSchema = z.string().uuid();
const orderItemIdSchema = z.string().uuid();

// Quick filters (docs/product.md § Bills tab): the default "Today" bounds
// the list to current business; "All" is an explicit opt-in for full
// history. "date" overrides the quick range with one exact calendar day —
// mutually exclusive with quickRange at the UI layer, but both are
// accepted here so the router doesn't need to guess which one is active.
export const listBillsInput = z.object({
	restaurantId: restaurantIdSchema,
	quickRange: z
		.enum(["today", "yesterday", "last3days", "all"])
		.default("today"),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

export const getBillInput = z.object({
	sessionId: sessionIdSchema,
});

export const requestBillInput = z.object({
	sessionId: sessionIdSchema,
});

export const waiveServiceChargeInput = z.object({
	sessionId: sessionIdSchema,
	waived: z.boolean(),
});

export const cancelOrderItemInput = z.object({
	orderItemId: orderItemIdSchema,
});

export const settleBillInput = z.object({
	sessionId: sessionIdSchema,
});

export const closeSessionInput = z.object({
	sessionId: sessionIdSchema,
});

export const downloadBillPdfInput = z.object({
	sessionId: sessionIdSchema,
});
