import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, uuid } from "drizzle-orm/pg-core";
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
// (referential integrity) instead of an untyped id column. When guests get
// their own identity, add a `addedByGuestId` column then; no rework needed.
export const cartItems = pgTable(
	"cart_items",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => tableSessions.id, { onDelete: "cascade" }),
		menuItemId: uuid("menu_item_id")
			.notNull()
			.references(() => menuItems.id),
		quantity: integer("quantity").notNull(),
		spice: spice("spice"),
		salt: salt("salt"),
		ice: ice("ice"),
		addedByType: actorType("added_by_type").notNull(),
		addedByStaffId: uuid("added_by_staff_id").references(() => staff.id, {
			onDelete: "set null",
		}),
		createdAt: createdAt(),
	},
	(t) => [
		index("cart_items_restaurant_id_idx").on(t.restaurantId),
		index("cart_items_session_id_idx").on(t.sessionId),
		check(
			"cart_items_added_by_staff_id_check",
			sql`(${t.addedByType} = 'staff' AND ${t.addedByStaffId} IS NOT NULL) OR (${t.addedByType} = 'guest' AND ${t.addedByStaffId} IS NULL)`,
		),
	],
);
