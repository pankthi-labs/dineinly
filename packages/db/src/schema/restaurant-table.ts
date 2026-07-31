import { foreignKey, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
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
		// Plain, nullable column — the real constraint is the composite FK
		// below, so session_id can never name a session from another
		// restaurant. A composite FK with a NULL member (the common "table is
		// free" case) is simply unchecked, per default MATCH SIMPLE.
		sessionId: uuid("session_id"),
	},
	(table) => [
		// Backs the composite FK below. Leftmost-prefixed by restaurant_id, so
		// it doubles as the tenant index — no single-column one needed.
		index("restaurant_tables_restaurant_id_session_id_idx").on(
			table.restaurantId,
			table.sessionId,
		),
		foreignKey({
			columns: [table.restaurantId, table.sessionId],
			foreignColumns: [tableSessions.restaurantId, tableSessions.id],
			name: "restaurant_tables_restaurant_id_session_id_fkey",
		}).onDelete("set null"),
	],
);
