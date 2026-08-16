import { z } from "zod";

// Pure zod, no server-only imports — mirrors restaurants.schema.ts so the
// staff router and its client-side form (app/restaurants/[restaurantId]/
// staff) validate identically off one schema.

const restaurantIdSchema = z.string().uuid();
const staffIdSchema = z.string().uuid();

// No 'owner' here — invite/edit only ever narrows further at the caller
// site (Managers may not touch Owners, staff.ts). Owner is a valid target
// role for an Owner/Admin caller, so the full staff_role enum is exposed;
// the client narrows the select options by the viewer's own role.
export const staffRoleSchema = z.enum([
	"waiter",
	"kitchen",
	"manager",
	"owner",
]);

export const staffFieldsSchema = z.object({
	name: z.string().trim().min(2).max(80),
	email: z.string().trim().toLowerCase().email(),
	role: staffRoleSchema,
});

export const listStaffInput = z.object({
	restaurantId: restaurantIdSchema,
});

export const inviteStaffInput = staffFieldsSchema.extend({
	restaurantId: restaurantIdSchema,
});

export const updateStaffInput = staffFieldsSchema.extend({
	id: staffIdSchema,
});

export const removeStaffInput = z.object({
	id: staffIdSchema,
});

export type StaffFields = z.infer<typeof staffFieldsSchema>;
