import { foreignKey, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { restaurantTableStatus } from "./enums.js";
import { id } from "./helpers.js";
import { restaurants } from "./restaurant.js";
import { sessions } from "./session.js";

// Physical floor plan — a table guests sit at. QR is 1:1 static, folded as a
// column. `sessionId` is the table's current active session — null means the
// table is free. Merge = multiple restaurant tables pointing at the same
// session. `status` is a soft-delete: a hidden table drops off the Table
// Matrix and its QR code stops starting new guest sessions, but its
// qr_token and row stay put — recreating it would mean reprinting a new QR
// code. A table can only be hidden while free (sessionId null); hiding is
// blocked while occupied so a live session can't go invisible.
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
		status: restaurantTableStatus("status").notNull().default("active"),
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
			foreignColumns: [sessions.restaurantId, sessions.id],
			name: "restaurant_tables_restaurant_id_session_id_fkey",
		}).onDelete("set null"),
	],
);
