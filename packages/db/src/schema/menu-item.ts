import {
	index,
	integer,
	numeric,
	pgTable,
	text,
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
		categoryId: uuid("category_id")
			.notNull()
			.references(() => menuCategories.id),
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
	(t) => [
		index("menu_items_restaurant_id_idx").on(t.restaurantId),
		index("menu_items_category_id_idx").on(t.categoryId),
	],
);
