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
import { bills } from "./bill.js";
import { actorType } from "./enums.js";
import { id } from "./helpers.js";
import { restaurants } from "./restaurant.js";
import { sessions } from "./session.js";
import { staff } from "./staff.js";

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
		// Which of the session's bills this round is billed against. Null until
		// a bill exists yet to attach to (One/Guest: no bill drawn until Request
		// Bill; backfilled onto every order in the session the moment one is —
		// see request_bill()). Never null by the time it matters for Counter,
		// whose bill is drawn atomically with the order itself (submit_order).
		// A session can carry more than one bill over its life (Counter: guest
		// settles, then orders again — see docs/core-data-model.md § Lifecycle
		// invariants), so this is what scopes a bill's total to only its own
		// round's orders instead of the whole session's history.
		billId: uuid("bill_id"),
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
		index("orders_restaurant_id_bill_id_idx").on(
			table.restaurantId,
			table.billId,
		),
		// Composite-FK target for order_items (see order-item.ts).
		unique("orders_restaurant_id_id_key").on(table.restaurantId, table.id),
		foreignKey({
			columns: [table.restaurantId, table.sessionId],
			foreignColumns: [sessions.restaurantId, sessions.id],
			name: "orders_restaurant_id_session_id_fkey",
		}),
		// No onDelete("set null"): Postgres nulls every column in a composite
		// FK column list on SET NULL, which would null restaurant_id too and
		// violate its NOT NULL constraint. force_terminate_session() nulls
		// bill_id itself before deleting a bill, so this stays "no action".
		foreignKey({
			columns: [table.restaurantId, table.billId],
			foreignColumns: [bills.restaurantId, bills.id],
			name: "orders_restaurant_id_bill_id_fkey",
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
