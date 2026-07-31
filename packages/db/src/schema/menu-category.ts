import { sql } from "drizzle-orm";
import {
	check,
	integer,
	numeric,
	pgTable,
	text,
	unique,
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
	(table) => [
		// Composite-FK target for menu_items (see menu-item.ts). Its unique
		// index is leftmost-prefixed by restaurant_id, so it doubles as the
		// tenant index — no single-column restaurant_id index needed.
		unique("menu_categories_restaurant_id_id_key").on(
			table.restaurantId,
			table.id,
		),
		check(
			"menu_categories_tax_rate_check",
			sql`${table.taxRate} between 0 and 1`,
		),
	],
);
