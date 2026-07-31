import { sql } from "drizzle-orm";
import {
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
	ice,
	menuItemStatus,
	salt,
	spice,
} from "./enums.js";
import { createdAt, id, updatedAt } from "./helpers.js";
import { menuCategories } from "./menu-category.js";
import { restaurants } from "./restaurant.js";

// Sellable catalog item. Labels and option groups folded as arrays/columns —
// no child tables. Option fields (spice/salt/ice) only apply when set; never
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
		price: numeric("price", { precision: 12, scale: 2 }).notNull(),
		prepTime: integer("prep_time").notNull(),
		servingSize: text("serving_size").notNull(),
		diet: diet("diet").notNull(),
		availability: availability("availability").notNull().default("available"),
		labels: text("labels").array().notNull().default([]),
		spice: spice("spice"),
		salt: salt("salt"),
		ice: ice("ice"),
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
		check("menu_items_prep_time_check", sql`${table.prepTime} > 0`),
	],
);
