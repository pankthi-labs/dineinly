import { sql } from "drizzle-orm";
import { check, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sessionStatus } from "./enums.js";
import { id } from "./helpers.js";
import { restaurants } from "./restaurant.js";

// One dining visit. Groups the shared cart, every order, and every bill for
// that visit — Full-Service has exactly one table pointing at it (see
// restaurant-table.ts); Counter/Menu have none, since they share one
// restaurant-level QR instead of a physical table. `opened_at` doubles as
// created-at — no separate column needed.
export const sessions = pgTable(
	"sessions",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		status: sessionStatus("status").notNull().default("active"),
		openedAt: timestamp("opened_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
	},
	(table) => [
		// Composite-FK target for orders / bills / restaurant_tables (see
		// order.ts, bill.ts, restaurant-table.ts). Its unique index is
		// leftmost-prefixed by restaurant_id, so it doubles as the tenant
		// index — no single-column restaurant_id index needed.
		unique("sessions_restaurant_id_id_key").on(table.restaurantId, table.id),
		check(
			"sessions_closed_at_check",
			sql`(${table.status} = 'active' AND ${table.closedAt} IS NULL) OR (${table.status} = 'closed' AND ${table.closedAt} IS NOT NULL)`,
		),
	],
);
