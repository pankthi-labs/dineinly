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
	uuid,
} from "drizzle-orm/pg-core";
import { diet, ice, orderItemStatus, salt, spice } from "./enums.js";
import { id } from "./helpers.js";
import { menuItems } from "./menu-item.js";
import { orders } from "./order.js";
import { restaurants } from "./restaurant.js";
import { staff } from "./staff.js";

// Kitchen fulfillment line. Snapshots name/price/diet/taxRate at order time —
// later menu or category edits never alter past orders or bills. Also serves
// as the bill line item (no separate Bill Line Item table — would duplicate
// this data). `taxRate` is copied from the item's category at order time;
// bill tax breakdown (e.g. CGST/SGST slabs) groups order_items by this column.
export const orderItems = pgTable(
	"order_items",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		// Plain column — the real constraint is the composite FK below, so
		// order_id can never name an order from another restaurant.
		orderId: uuid("order_id").notNull(),
		itemName: text("item_name").notNull(),
		unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
		taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).notNull(),
		diet: diet("diet").notNull(),
		quantity: integer("quantity").notNull(),
		spice: spice("spice"),
		salt: salt("salt"),
		ice: ice("ice"),
		status: orderItemStatus("status").notNull().default("placed"),
		// Bills tab correction (product.md § Bills tab "Waive Item") — the
		// portion of quantity excluded from bill math without touching status
		// or quantity itself, for exceptional cases (quality complaint,
		// short-served quantity) that aren't a mis-added order. 0 means not
		// waived; equal to quantity means fully waived. Reversible until the
		// bill settles.
		waivedQuantity: integer("waived_quantity").notNull().default(0),
		// Bills tab correction (product.md § Bills tab "Cancel Item") — the
		// portion of quantity cancelled pre-prep, excluded from both bill math
		// and the kitchen queue without splitting the row. Only settable while
		// status is 'placed'; reaching quantity flips status to 'cancelled'
		// (irreversible, same as a whole-row cancel).
		cancelledQuantity: integer("cancelled_quantity").notNull().default(0),
		// Set by the kitchen when it advances status (Kitchen Display) — null
		// until that transition happens. Lets elapsed-time displays report
		// time-in-preparation and time-awaiting-pickup separately, rather than
		// approximating both from the order's placedAt.
		preparingAt: timestamp("preparing_at", {
			withTimezone: true,
			mode: "string",
		}),
		readyAt: timestamp("ready_at", { withTimezone: true, mode: "string" }),
		// Plain column — the real constraint is the composite FK below, so
		// menu_item_id can never name an item from another restaurant.
		menuItemId: uuid("menu_item_id"),
		// Snapshot of cart_items.addedByStaffId at order time — null when the
		// line was guest-added. cart_items rows are deleted once an order is
		// placed (submit_order/staff_submit_order), so without this copy the
		// per-item PIN attribution is lost the moment the cart clears.
		addedByStaffId: uuid("added_by_staff_id"),
	},
	(table) => [
		index("order_items_order_id_idx").on(table.orderId),
		// Backs the composite FK below. Leftmost-prefixed by restaurant_id, so
		// it doubles as the tenant index — no single-column one needed.
		index("order_items_restaurant_id_order_id_idx").on(
			table.restaurantId,
			table.orderId,
		),
		// Kitchen queue query path: filter this restaurant's items by status.
		index("order_items_restaurant_id_status_idx").on(
			table.restaurantId,
			table.status,
		),
		foreignKey({
			columns: [table.restaurantId, table.orderId],
			foreignColumns: [orders.restaurantId, orders.id],
			name: "order_items_restaurant_id_order_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.restaurantId, table.menuItemId],
			foreignColumns: [menuItems.restaurantId, menuItems.id],
			name: "order_items_restaurant_id_menu_item_id_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.restaurantId, table.addedByStaffId],
			foreignColumns: [staff.restaurantId, staff.id],
			name: "order_items_restaurant_id_added_by_staff_id_fkey",
		}).onDelete("set null"),
		check(
			"order_items_quantity_check",
			sql`${table.quantity} > 0 AND ${table.quantity} <= 99`,
		),
		check("order_items_unit_price_check", sql`${table.unitPrice} >= 0`),
		check("order_items_tax_rate_check", sql`${table.taxRate} between 0 and 1`),
		check(
			"order_items_waived_quantity_check",
			sql`${table.waivedQuantity} >= 0 AND ${table.waivedQuantity} <= ${table.quantity}`,
		),
		check(
			"order_items_cancelled_quantity_check",
			sql`${table.cancelledQuantity} >= 0 AND ${table.cancelledQuantity} <= ${table.quantity}`,
		),
		check(
			"order_items_waived_cancelled_quantity_check",
			sql`${table.waivedQuantity} + ${table.cancelledQuantity} <= ${table.quantity}`,
		),
	],
);
