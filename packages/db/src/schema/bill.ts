import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { billStatus } from "./enums.js";
import { createdAt, id, updatedAt } from "./helpers.js";
import { restaurants } from "./restaurant.js";
import { sessions } from "./session.js";
import { staff } from "./staff.js";

// Financial record for one settle round of a session. A session can carry
// more than one bill over its life — Counter lets a guest settle, then order
// again, drawing a fresh bill for the new round (docs/core-data-model.md §
// Lifecycle invariants); One/Guest still only ever draw one, since ordering
// there stays hard-blocked once settled. Own lifecycle (open -> requested ->
// settled), distinct from the session's own. Amounts are derived on read for
// presentation (open/requested) and frozen only at settle. No tax_rate
// snapshot here — tax is snapshotted per line on order_items; the bill's tax
// breakdown is derived by grouping those by rate.
export const bills = pgTable(
	"bills",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		// Plain column — the real constraint is the composite FK below, so
		// session_id can never name a session from another restaurant. Not
		// unique: a session can carry more than one bill (see header comment).
		sessionId: uuid("session_id").notNull(),
		// Human-facing bill identifier — an 8-character code (A-Z minus I/O,
		// digits 2-9: 32 chars, ~1.1 trillion values), assigned once at first
		// request_bill() (never on the id/uuid, which stays internal) via the
		// bill_number_seq -> encode_bill_number() default, so it's collision-free
		// by construction rather than random-with-retry.
		billNumber: text("bill_number")
			.notNull()
			.default(sql`encode_bill_number(nextval('bill_number_seq'::regclass))`),
		// Counter only: the small, per-restaurant, per-day number guests are
		// shown and pay against at the counter. Null for every other experience.
		// Assigned once by request_bill() via next_daily_token() — never a
		// column default, since it needs two arguments (restaurant, day).
		dailyToken: integer("daily_token"),
		status: billStatus("status").notNull().default("open"),
		// Nullable until settle; derived on read before that.
		subtotal: numeric("subtotal", { precision: 12, scale: 2 }),
		taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }),
		total: numeric("total", { precision: 12, scale: 2 }),
		settledAt: timestamp("settled_at", { withTimezone: true, mode: "string" }),
		// Plain column — the real constraint is the composite FK below, so
		// settled_by can never name a staff member from another restaurant.
		settledBy: uuid("settled_by"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("bills_restaurant_id_idx").on(table.restaurantId),
		// Backs orders.billId's composite FK (see order.ts) — leftmost-prefixed
		// by restaurant_id, same tenant-index reasoning as every other
		// session-scoped table.
		index("bills_restaurant_id_session_id_idx").on(
			table.restaurantId,
			table.sessionId,
		),
		// Composite-FK target for orders.billId (see order.ts).
		unique("bills_restaurant_id_id_key").on(table.restaurantId, table.id),
		// Globally unique: bill_number_seq is one counter shared by every
		// restaurant, so uniqueness never needs restaurant_id in the constraint.
		unique("bills_bill_number_key").on(table.billNumber),
		foreignKey({
			columns: [table.restaurantId, table.sessionId],
			foreignColumns: [sessions.restaurantId, sessions.id],
			name: "bills_restaurant_id_session_id_fkey",
		}),
		foreignKey({
			columns: [table.restaurantId, table.settledBy],
			foreignColumns: [staff.restaurantId, staff.id],
			name: "bills_restaurant_id_settled_by_fkey",
		}).onDelete("set null"),
		check("bills_subtotal_check", sql`${table.subtotal} >= 0`),
		check("bills_tax_amount_check", sql`${table.taxAmount} >= 0`),
		check("bills_total_check", sql`${table.total} >= 0`),
		// Amounts and settledAt are frozen exactly at settle
		// (core-data-model.md: "derived on read" until then, "frozen only at
		// settle") — mirrors the actor-type CHECK pattern on cart_items/orders.
		check(
			"bills_settled_check",
			sql`(${table.status} = 'settled' AND ${table.settledAt} IS NOT NULL AND ${table.subtotal} IS NOT NULL AND ${table.taxAmount} IS NOT NULL AND ${table.total} IS NOT NULL) OR (${table.status} <> 'settled' AND ${table.settledAt} IS NULL)`,
		),
	],
);
