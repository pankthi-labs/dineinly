import { z } from "zod";

// Pure zod, no server-only imports — mirrors restaurants.schema.ts so the
// tables router and its client-side form (app/restaurants/[restaurantId]/
// tables) validate identically off one schema.

const restaurantIdSchema = z.string().uuid();
const tableIdSchema = z.string().uuid();

export const tableFieldsSchema = z.object({
	label: z.string().trim().min(1).max(40),
});

export const listTablesInput = z.object({
	restaurantId: restaurantIdSchema,
});

export const createTableInput = tableFieldsSchema.extend({
	restaurantId: restaurantIdSchema,
});

export const updateTableInput = tableFieldsSchema.extend({
	id: tableIdSchema,
});

export const setTableStatusInput = z.object({
	id: tableIdSchema,
	status: z.enum(["active", "archived"]),
});

export const regenerateTableQrInput = z.object({
	id: tableIdSchema,
});

export const downloadTableQrPdfInput = z.object({
	id: tableIdSchema,
	// The browser's own origin — used only to encode the scannable guest
	// link into the QR, never for auth. Passed by the client since a tRPC
	// procedure has no reliable "public site URL" of its own to fall back on.
	origin: z.string().url(),
});

export const downloadAllTableQrPdfInput = z.object({
	restaurantId: restaurantIdSchema,
	origin: z.string().url(),
});

export type TableFields = z.infer<typeof tableFieldsSchema>;
