import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { actorType } from "./enums.js";
import { id } from "./helpers.js";
import { restaurants } from "./restaurant.js";
import { staff } from "./staff.js";
import { tableSessions } from "./table-session.js";

// One confirmed round, sent to the kitchen. Attribution is explicit:
// `placedByType` says who, `placedByStaffId` is set only when that's staff
// (waiter/manager/owner) — see cart-item.ts for the same pattern.
// `idempotencyKey` blocks duplicate orders from retries or repeated taps —
// Submit Order is the only mutation that needs one (see
// docs/architecture.md § Authorization & Idempotency).
export const orders = pgTable(
	"orders",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		// Plain column — the real constraint is the composite FK below, so
		// session_id can never name a session from another restaurant.
		sessionId: uuid("session_id").notNull(),
		placedAt: timestamp("placed_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		placedByType: actorType("placed_by_type").notNull(),
		placedByStaffId: uuid("placed_by_staff_id"),
		idempotencyKey: text("idempotency_key").notNull().unique(),
	},
	(table) => [
		// Backs the composite FK below. Leftmost-prefixed by restaurant_id, so
		// it doubles as the tenant index — no single-column one needed.
		index("orders_restaurant_id_session_id_idx").on(
			table.restaurantId,
			table.sessionId,
		),
		// Composite-FK target for order_items (see order-item.ts).
		unique("orders_restaurant_id_id_key").on(table.restaurantId, table.id),
		foreignKey({
			columns: [table.restaurantId, table.sessionId],
			foreignColumns: [tableSessions.restaurantId, tableSessions.id],
			name: "orders_restaurant_id_session_id_fkey",
		}),
		foreignKey({
			columns: [table.restaurantId, table.placedByStaffId],
			foreignColumns: [staff.restaurantId, staff.id],
			name: "orders_restaurant_id_placed_by_staff_id_fkey",
		}).onDelete("set null"),
		check(
			"orders_placed_by_staff_id_check",
			sql`(${table.placedByType} = 'staff' AND ${table.placedByStaffId} IS NOT NULL) OR (${table.placedByType} = 'guest' AND ${table.placedByStaffId} IS NULL) OR (${table.placedByType} = 'dineinly_admin' AND ${table.placedByStaffId} IS NULL)`,
		),
	],
);
