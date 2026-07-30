import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id } from "./helpers.js";
import { restaurants } from "./restaurant.js";
import { tableSessions } from "./table-session.js";

// Physical floor plan — a table guests sit at. QR is 1:1 static, folded as a
// column. `sessionId` is the table's current active session — null means the
// table is free. Merge = multiple restaurant tables pointing at the same
// session.
export const restaurantTables = pgTable(
	"restaurant_tables",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		qrToken: text("qr_token").notNull().unique(),
		sessionId: uuid("session_id").references(() => tableSessions.id, {
			onDelete: "set null",
		}),
	},
	(t) => [
		index("restaurant_tables_restaurant_id_idx").on(t.restaurantId),
		index("restaurant_tables_session_id_idx").on(t.sessionId),
	],
);
