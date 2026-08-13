import { z } from "zod";

// Pure zod, no server-only imports — mirrors tables.schema.ts so the bills
// router and its client-side pages (app/restaurants/[restaurantId]/bills)
// validate identically off one schema.

const restaurantIdSchema = z.string().uuid();
const sessionIdSchema = z.string().uuid();
const orderItemIdSchema = z.string().uuid();

// Filters (docs/product.md § Bills tab): defaults to today; "date" opts
// into one exact calendar day instead — mutually exclusive at the UI layer.
export const listBillsInput = z.object({
	restaurantId: restaurantIdSchema,
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
	cancelledQuantity: z.number().int().min(0),
});

export const waiveOrderItemInput = z.object({
	orderItemId: orderItemIdSchema,
	waivedQuantity: z.number().int().min(0),
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
