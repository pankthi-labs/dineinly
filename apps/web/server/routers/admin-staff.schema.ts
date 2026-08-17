import { z } from "zod";

// Pure zod, no server-only imports — mirrors staff.schema.ts so the router
// and its client-side form validate identically off one schema.

const adminIdSchema = z.string().uuid();

export const adminStaffFieldsSchema = z.object({
	name: z.string().trim().min(2).max(80),
	email: z.string().trim().toLowerCase().email(),
});

export const inviteAdminStaffInput = adminStaffFieldsSchema;

// Edit only ever changes the name (Tbd.md "Dineinly Staff") — email and the
// admin claim itself are fixed once created.
export const updateAdminStaffInput = z.object({
	id: adminIdSchema,
	name: z.string().trim().min(2).max(80),
});

export const removeAdminStaffInput = z.object({
	id: adminIdSchema,
});

export type AdminStaffFields = z.infer<typeof adminStaffFieldsSchema>;
