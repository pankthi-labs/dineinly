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

// Which kind of shared device a station identity represents (docs/
// architecture.md § Station Account Provisioning). Kitchen ships later —
// this column exists now so that follow-up needs no migration of its own,
// just a new enum value.
export const stationType = pgEnum("station_type", ["waiter"]);

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

// Which Dineinly package a restaurant runs (docs/product.md § Dineinly
// Experiences). Gates ordering/kitchen/bill router behavior restaurant-wide.
// Menu spans either track; guest/one are Full-Service, counter is
// Quick-Service.
export const restaurantExperience = pgEnum("restaurant_experience", [
	"menu",
	"guest",
	"counter",
	"one",
]);
export const menuCategoryStatus = pgEnum("menu_category_status", [
	"active",
	"archived",
]);
export const menuItemStatus = pgEnum("menu_item_status", [
	"active",
	"archived",
]);
export const restaurantTableStatus = pgEnum("restaurant_table_status", [
	"active",
	"archived",
]);

export const sessionStatus = pgEnum("session_status", ["active", "closed"]);

// Who performed an action: staff (see staffId FK), an anonymous guest, or
// Dineinly Admin acting on a restaurant's behalf (no Staff row of their own —
// see order.ts/cart-item.ts check constraints, both of which require a null
// staffId for this branch same as 'guest').
export const actorType = pgEnum("actor_type", [
	"staff",
	"guest",
	"dineinly_admin",
]);

export const diet = pgEnum("diet", ["veg", "non_veg"]);

export const availability = pgEnum("availability", ["available", "sold_out"]);

// Guest-selectable option groups. Only shown when the item sets the field.
export const spice = pgEnum("spice", ["mild", "regular", "extra spicy"]);
export const salt = pgEnum("salt", ["less salt", "regular"]);
export const ice = pgEnum("ice", ["none", "less", "regular"]);

// Display-only (docs/product.md) — never used for timing/calculation, so a
// bucketed range is as precise as it needs to be.
export const menuItemPrepTime = pgEnum("menu_item_prep_time", [
	"5-10 mins",
	"10-15 mins",
	"15-20 mins",
	"20-30 mins",
	"30-45 mins",
]);
export const menuItemServingSize = pgEnum("menu_item_serving_size", [
	"serves 1",
	"serves 1-2",
	"serves 2",
	"serves 2-3",
	"serves 4-5",
	"serves 5+",
]);

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
