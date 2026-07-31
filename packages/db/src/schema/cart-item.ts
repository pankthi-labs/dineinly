import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	pgTable,
	uuid,
} from "drizzle-orm/pg-core";
import { actorType, ice, salt, spice } from "./enums.js";
import { createdAt, id } from "./helpers.js";
import { menuItems } from "./menu-item.js";
import { restaurants } from "./restaurant.js";
import { staff } from "./staff.js";
import { tableSessions } from "./table-session.js";

// Live shared cart, pre-confirm. Rows, not a JSON blob — row-level writes so
// two guests adding different items never clobber each other. Concurrent
// edits to the *same* line are last-write-wins (app-level, not schema).
// Attribution is explicit: `addedByType` says who, `addedByStaffId` is set
// only when that's staff. No polymorphic actor id — this keeps a real FK
// (referential integrity) instead of an untyped id column.
export const cartItems = pgTable(
	"cart_items",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		// Plain columns — the real constraints are the composite FKs below, so
		// neither can name a session, item, or staff member from another
		// restaurant.
		sessionId: uuid("session_id").notNull(),
		menuItemId: uuid("menu_item_id").notNull(),
		quantity: integer("quantity").notNull(),
		spice: spice("spice"),
		salt: salt("salt"),
		ice: ice("ice"),
		addedByType: actorType("added_by_type").notNull(),
		addedByStaffId: uuid("added_by_staff_id"),
		createdAt: createdAt(),
	},
	(table) => [
		// Backs the session_id FK below. Leftmost-prefixed by restaurant_id, so
		// it doubles as the tenant index — no single-column one needed.
		index("cart_items_restaurant_id_session_id_idx").on(
			table.restaurantId,
			table.sessionId,
		),
		// Backs the menu_item_id FK below; same leftmost-prefix reasoning.
		index("cart_items_restaurant_id_menu_item_id_idx").on(
			table.restaurantId,
			table.menuItemId,
		),
		foreignKey({
			columns: [table.restaurantId, table.sessionId],
			foreignColumns: [tableSessions.restaurantId, tableSessions.id],
			name: "cart_items_restaurant_id_session_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.restaurantId, table.menuItemId],
			foreignColumns: [menuItems.restaurantId, menuItems.id],
			name: "cart_items_restaurant_id_menu_item_id_fkey",
		}),
		foreignKey({
			columns: [table.restaurantId, table.addedByStaffId],
			foreignColumns: [staff.restaurantId, staff.id],
			name: "cart_items_restaurant_id_added_by_staff_id_fkey",
		}).onDelete("set null"),
		check(
			"cart_items_added_by_staff_id_check",
			sql`(${table.addedByType} = 'staff' AND ${table.addedByStaffId} IS NOT NULL) OR (${table.addedByType} = 'guest' AND ${table.addedByStaffId} IS NULL)`,
		),
		check(
			"cart_items_quantity_check",
			sql`${table.quantity} > 0 AND ${table.quantity} <= 99`,
		),
	],
);
