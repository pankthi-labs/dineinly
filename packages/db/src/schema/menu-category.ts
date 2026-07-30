import {
	index,
	integer,
	numeric,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { menuCategoryStatus } from "./enums.js";
import { id } from "./helpers.js";
import { restaurants } from "./restaurant.js";

// Menu grouping and display order. Own table for stable IDs and reordering.
// Carries `taxRate` — food vs. drinks are taxed at different rates; this is
// the natural per-category home for it (snapshotted onto order_item at order
// time, see order-item.ts).
export const menuCategories = pgTable(
	"menu_categories",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		sort: integer("sort").notNull().default(0),
		taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).notNull(),
		status: menuCategoryStatus("status").notNull().default("active"),
	},
	(t) => [index("menu_categories_restaurant_id_idx").on(t.restaurantId)],
);
