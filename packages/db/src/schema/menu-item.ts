import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	numeric,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import {
	availability,
	diet,
	menuItemPrepTime,
	menuItemServingSize,
	menuItemStatus,
} from "./enums.js";
import { createdAt, id, updatedAt } from "./helpers.js";
import { menuCategories } from "./menu-category.js";
import { restaurants } from "./restaurant.js";

// Sellable catalog item. Labels folded as an array column — no child tables.
// offers_spice/offers_salt/offers_ice only gate whether the guest sees that
// preference at order time; the actual value (mild/regular/extra spicy, etc.)
// is a guest choice recorded on Cart Item / Order Item, never here. Never
// affect price. `availability` (temporary 86'd) and `status` (soft-delete)
// are separate axes — sold-out is not deleted.
export const menuItems = pgTable(
	"menu_items",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		// Plain column — the real constraint is the composite FK below, so
		// category_id can never name a category from another restaurant.
		categoryId: uuid("category_id").notNull(),
		name: text("name").notNull(),
		description: text("description").notNull(),
		sort: integer("sort").notNull().default(0),
		price: numeric("price", { precision: 12, scale: 2 }).notNull(),
		prepTime: menuItemPrepTime("prep_time").notNull(),
		servingSize: menuItemServingSize("serving_size").notNull(),
		diet: diet("diet").notNull(),
		availability: availability("availability").notNull().default("available"),
		labels: text("labels").array().notNull().default([]),
		offersSpice: boolean("offers_spice").notNull().default(false),
		offersSalt: boolean("offers_salt").notNull().default(false),
		offersIce: boolean("offers_ice").notNull().default(false),
		status: menuItemStatus("status").notNull().default("active"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		// Lookup path "this restaurant's items in category X", and backs the
		// composite FK below. Leftmost-prefixed by restaurant_id, so it
		// doubles as the tenant index — no single-column one needed.
		index("menu_items_restaurant_id_category_id_idx").on(
			table.restaurantId,
			table.categoryId,
		),
		// Composite-FK target for cart_items (see cart-item.ts).
		unique("menu_items_restaurant_id_id_key").on(table.restaurantId, table.id),
		foreignKey({
			columns: [table.restaurantId, table.categoryId],
			foreignColumns: [menuCategories.restaurantId, menuCategories.id],
			name: "menu_items_restaurant_id_category_id_fkey",
		}),
		check("menu_items_price_check", sql`${table.price} >= 0`),
	],
);
