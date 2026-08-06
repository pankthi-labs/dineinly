import { pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id } from "./helpers.js";
import { restaurants } from "./restaurant.js";

// Restaurant-scoped label vocabulary (e.g. "Chef Recommended", "Seasonal").
// menu_items.labels stores the chosen names directly as text[] — this table
// is the bounded set an admin picks from, not a join table.
export const menuLabels = pgTable(
	"menu_labels",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
	},
	(table) => [
		unique("menu_labels_restaurant_id_name_key").on(
			table.restaurantId,
			table.name,
		),
	],
);
