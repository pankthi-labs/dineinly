import { pgEnum } from "drizzle-orm/pg-core";

// Staff RBAC role. Tenant employees only — guests never have a Staff row,
// and Dineinly Admin is a platform Supabase-auth claim, not a tenant row
// (see restaurant.ts / staff.ts comments).
export const staffRole = pgEnum("staff_role", [
	"waiter",
	"kitchen",
	"manager",
	"owner",
]);

// Staff lifecycle. Soft-delete via status, not a deleted_at column.
export const staffStatus = pgEnum("staff_status", [
	"invited",
	"active",
	"removed",
]);

// Soft-delete status, one enum per entity so each can grow independently.
export const restaurantStatus = pgEnum("restaurant_status", [
	"active",
	"archived",
]);
export const menuCategoryStatus = pgEnum("menu_category_status", [
	"active",
	"archived",
]);
export const menuItemStatus = pgEnum("menu_item_status", [
	"active",
	"archived",
]);

export const sessionStatus = pgEnum("session_status", ["active", "closed"]);

// Who performed an action: staff (see staffId FK) or an anonymous guest.
export const actorType = pgEnum("actor_type", ["staff", "guest"]);

export const diet = pgEnum("diet", ["veg", "non_veg"]);

export const availability = pgEnum("availability", ["available", "sold_out"]);

// Guest-selectable option groups. Only shown when the item sets the field.
export const spice = pgEnum("spice", ["mild", "regular", "extra spicy"]);
export const salt = pgEnum("salt", ["less salt", "regular"]);
export const ice = pgEnum("ice", ["none", "less", "regular"]);

export const orderItemStatus = pgEnum("order_item_status", [
	"placed",
	"preparing",
	"ready",
	"served",
	"cancelled",
]);

export const billStatus = pgEnum("bill_status", [
	"open",
	"requested",
	"settled",
]);
