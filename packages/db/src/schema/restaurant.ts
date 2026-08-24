import { sql } from "drizzle-orm";
import { check, numeric, pgTable, text } from "drizzle-orm/pg-core";
import { restaurantExperience, restaurantStatus } from "./enums.js";
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
		// Which Dineinly package this restaurant runs — set at creation, changed
		// via the same admin edit flow. See restaurantExperience in enums.ts.
		experience: restaurantExperience("experience").notNull().default("one"),
		// Counter's universal QR (docs/core-data-model.md § Experience Gating).
		// Null for every other experience — set only by ensure_counter_qr_token()
		// the moment a restaurant becomes counter-experience. Unlike
		// Restaurant Table.qr_token, resolving this token never looks up an
		// existing session — it always creates one (see resolve_qr_token()).
		counterQrToken: text("counter_qr_token").unique(),
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
