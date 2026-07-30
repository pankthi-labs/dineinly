import { sql } from "drizzle-orm";
import {
	check,
	index,
	pgTable,
	text,
	timestamp,
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
// `idempotencyKey` is the only dedupe guard in MVP — blocks duplicate orders
// from retries or repeated taps (Submit Order is the only mutation that
// needs one).
export const orders = pgTable(
	"orders",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => tableSessions.id),
		placedAt: timestamp("placed_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		placedByType: actorType("placed_by_type").notNull(),
		placedByStaffId: uuid("placed_by_staff_id").references(() => staff.id, {
			onDelete: "set null",
		}),
		idempotencyKey: text("idempotency_key").notNull().unique(),
	},
	(t) => [
		index("orders_restaurant_id_idx").on(t.restaurantId),
		index("orders_session_id_idx").on(t.sessionId),
		check(
			"orders_placed_by_staff_id_check",
			sql`(${t.placedByType} = 'staff' AND ${t.placedByStaffId} IS NOT NULL) OR (${t.placedByType} = 'guest' AND ${t.placedByStaffId} IS NULL)`,
		),
	],
);
