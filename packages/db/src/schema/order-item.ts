import {
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
		orderId: uuid("order_id")
			.notNull()
			.references(() => orders.id, { onDelete: "cascade" }),
		itemName: text("item_name").notNull(),
		unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
		taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).notNull(),
		diet: diet("diet").notNull(),
		quantity: integer("quantity").notNull(),
		spice: spice("spice"),
		salt: salt("salt"),
		ice: ice("ice"),
		status: orderItemStatus("status").notNull().default("placed"),
		menuItemId: uuid("menu_item_id").references(() => menuItems.id, {
			onDelete: "set null",
		}),
	},
	(t) => [
		index("order_items_order_id_idx").on(t.orderId),
		// Kitchen queue query path: filter this restaurant's items by status.
		index("order_items_restaurant_id_status_idx").on(t.restaurantId, t.status),
	],
);
