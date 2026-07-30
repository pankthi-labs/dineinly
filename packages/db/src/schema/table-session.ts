import { index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessionStatus } from "./enums.js";
import { id } from "./helpers.js";
import { restaurants } from "./restaurant.js";

// One dining visit. Groups the shared cart, all orders, and the bill for
// that visit. `opened_at` doubles as created-at — no separate column needed.
export const tableSessions = pgTable(
	"table_sessions",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		status: sessionStatus("status").notNull().default("active"),
		openedAt: timestamp("opened_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(t) => [index("table_sessions_restaurant_id_idx").on(t.restaurantId)],
);
