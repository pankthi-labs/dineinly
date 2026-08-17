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

export const reassignOwnerInput = z.object({
	restaurantId: restaurantIdSchema,
	newOwnerStaffId: staffIdSchema,
});

// Shared with the client-side PIN forms (profile-sheet.tsx, reset-pin-
// sheet.tsx) so both validate identically off one pattern.
export const PIN_PATTERN = /^\d{4,6}$/;

const pinSchema = z
	.string()
	.trim()
	.regex(PIN_PATTERN, "PIN must be 4 to 6 digits");

export const setPinInput = z.object({
	restaurantId: restaurantIdSchema,
	pin: pinSchema,
});

// Dineinly Admin override — resets any staff member's PIN, no restaurant
// scoping needed (staff_id alone names one row; Admin's reach isn't
// tenant-scoped). See admin_reset_staff_pin.
export const adminResetPinInput = z.object({
	staffId: staffIdSchema,
	pin: pinSchema,
});

export const myProfileInput = z.object({
	restaurantId: restaurantIdSchema,
});

export const updateOwnProfileInput = z.object({
	restaurantId: restaurantIdSchema,
	name: z.string().trim().min(2).max(80),
});

export type StaffFields = z.infer<typeof staffFieldsSchema>;
