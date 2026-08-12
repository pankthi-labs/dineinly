import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
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
		// Plain column, still unique (one bill per session) — the real
		// constraint is the composite FK below, so session_id can never name
		// a session from another restaurant.
		sessionId: uuid("session_id").notNull().unique(),
		// Human-facing bill identifier — an 8-character code (A-Z minus I/O,
		// digits 2-9: 32 chars, ~1.1 trillion values), assigned once at first
		// request_bill() (never on the id/uuid, which stays internal) via the
		// bill_number_seq -> encode_bill_number() default, so it's collision-free
		// by construction rather than random-with-retry.
		billNumber: text("bill_number")
			.notNull()
			.default(sql`encode_bill_number(nextval('bill_number_seq'::regclass))`),
		status: billStatus("status").notNull().default("open"),
		// Snapshotted at request/settle time — restaurant-level rate can change later.
		serviceChargeRate: numeric("service_charge_rate", {
			precision: 5,
			scale: 4,
		}),
		// Staff correction (Bills tab "Waive Service Charge"). While true,
		// request_bill()'s snapshot-on-every-call logic holds serviceChargeRate
		// at 0 instead of re-copying the restaurant's rate, so a guest's own
		// bill.get poll can't silently undo a waiver.
		serviceChargeWaived: boolean("service_charge_waived")
			.notNull()
			.default(false),
		// Nullable until settle; derived on read before that.
		subtotal: numeric("subtotal", { precision: 12, scale: 2 }),
		taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }),
		serviceChargeAmount: numeric("service_charge_amount", {
			precision: 12,
			scale: 2,
		}),
		total: numeric("total", { precision: 12, scale: 2 }),
		settledAt: timestamp("settled_at", { withTimezone: true, mode: "string" }),
		// Plain column — the real constraint is the composite FK below, so
		// settled_by can never name a staff member from another restaurant.
		settledBy: uuid("settled_by"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		// Kept single-column, unlike the other tenant tables: nothing else
		// here is leftmost-prefixed by restaurant_id (session_id's unique
		// constraint is its own index, and the composite FK below gets none)
		// other than the bill_number uniqueness below — so this stays its own
		// tenant index.
		index("bills_restaurant_id_idx").on(table.restaurantId),
		// Globally unique: bill_number_seq is one counter shared by every
		// restaurant, so uniqueness never needs restaurant_id in the constraint.
		unique("bills_bill_number_key").on(table.billNumber),
		foreignKey({
			columns: [table.restaurantId, table.sessionId],
			foreignColumns: [tableSessions.restaurantId, tableSessions.id],
			name: "bills_restaurant_id_session_id_fkey",
		}),
		foreignKey({
			columns: [table.restaurantId, table.settledBy],
			foreignColumns: [staff.restaurantId, staff.id],
			name: "bills_restaurant_id_settled_by_fkey",
		}).onDelete("set null"),
		check(
			"bills_service_charge_rate_check",
			sql`${table.serviceChargeRate} between 0 and 1`,
		),
		check("bills_subtotal_check", sql`${table.subtotal} >= 0`),
		check("bills_tax_amount_check", sql`${table.taxAmount} >= 0`),
		check(
			"bills_service_charge_amount_check",
			sql`${table.serviceChargeAmount} >= 0`,
		),
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
