import { sql } from "drizzle-orm";
import { check, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { restaurantStatus } from "./enums.js";
import { createdAt, id, updatedAt } from "./helpers.js";

// Tenant root. Restaurant settings folded in as columns — read on nearly
// every request, no join. Soft-delete via `status`, never hard-deleted.
// address/city/gstNumber/state/pincode are the bill header fields.
export const restaurants = pgTable(
	"restaurants",
	{
		id: id(),
		name: text("name").notNull(),
		address: text("address").notNull(),
		city: text("city").notNull(),
		gstNumber: text("gst_number").notNull(),
		state: text("state").notNull(),
		pincode: text("pincode").notNull(),
		// Nullable — null means this restaurant levies no service charge.
		serviceChargeRate: numeric("service_charge_rate", {
			precision: 5,
			scale: 4,
		}),
		status: restaurantStatus("status").notNull().default("active"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"restaurants_service_charge_rate_check",
			sql`${table.serviceChargeRate} between 0 and 1`,
		),
	],
);
