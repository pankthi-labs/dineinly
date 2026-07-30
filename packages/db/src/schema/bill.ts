import { index, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { billStatus } from "./enums.js";
import { createdAt, id, updatedAt } from "./helpers.js";
import { restaurants } from "./restaurant.js";
import { staff } from "./staff.js";
import { tableSessions } from "./table-session.js";

// Financial record for the session. Own table: own lifecycle
// (open -> requested -> settled) distinct from the session's. Amounts are
// derived on read for presentation (open/requested) and frozen only at
// settle. No tax_rate snapshot here — tax is snapshotted per line on
// order_items; the bill's tax breakdown is derived by grouping those by rate.
export const bills = pgTable(
	"bills",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		sessionId: uuid("session_id")
			.notNull()
			.unique()
			.references(() => tableSessions.id, { onDelete: "cascade" }),
		status: billStatus("status").notNull().default("open"),
		// Snapshotted at request/settle time — restaurant-level rate can change later.
		serviceChargeRate: numeric("service_charge_rate", {
			precision: 5,
			scale: 4,
		}),
		// Nullable until settle; derived on read before that.
		subtotal: numeric("subtotal", { precision: 12, scale: 2 }),
		taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }),
		serviceChargeAmount: numeric("service_charge_amount", {
			precision: 12,
			scale: 2,
		}),
		total: numeric("total", { precision: 12, scale: 2 }),
		settledAt: timestamp("settled_at", { withTimezone: true }),
		settledBy: uuid("settled_by").references(() => staff.id, {
			onDelete: "set null",
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [index("bills_restaurant_id_idx").on(t.restaurantId)],
);
