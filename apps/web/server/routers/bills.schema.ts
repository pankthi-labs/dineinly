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

export const cancelOrderItemInput = z.object({
	orderItemId: orderItemIdSchema,
	cancelledQuantity: z.number().int().min(0),
});

// Counter only (bills/[sessionId]/page.tsx's inline quantity pill, pre-kitchen
// items): the pill's displayed number is the item's true quantity, not a
// cancelled-quantity offset — 0 removes the item (server maps it onto a full
// cancel), anything else replaces `quantity` outright and clears any prior
// waive/cancel bookkeeping. order_items_quantity_check caps it at 99.
export const setOrderItemQuantityInput = z.object({
	orderItemId: orderItemIdSchema,
	quantity: z.number().int().min(0).max(99),
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

export const forceTerminateSessionInput = z.object({
	sessionId: sessionIdSchema,
});

export const downloadBillPdfInput = z.object({
	sessionId: sessionIdSchema,
});
