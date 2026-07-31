import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	numeric,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { diet, ice, orderItemStatus, salt, spice } from "./enums.js";
import { id } from "./helpers.js";
import { menuItems } from "./menu-item.js";
import { orders } from "./order.js";
import { restaurants } from "./restaurant.js";

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
		// Plain column — the real constraint is the composite FK below, so
		// menu_item_id can never name an item from another restaurant.
		menuItemId: uuid("menu_item_id"),
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
		check(
			"order_items_quantity_check",
			sql`${table.quantity} > 0 AND ${table.quantity} <= 99`,
		),
		check("order_items_unit_price_check", sql`${table.unitPrice} >= 0`),
		check("order_items_tax_rate_check", sql`${table.taxRate} between 0 and 1`),
	],
);
