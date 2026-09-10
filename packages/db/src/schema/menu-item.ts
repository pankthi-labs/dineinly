import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	foreignKey,
	index,
	numeric,
	pgTable,
	smallint,
	text,
	time,
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
		description: text("description"),
		price: numeric("price", { precision: 12, scale: 2 }).notNull(),
		prepTime: menuItemPrepTime("prep_time").notNull(),
		servingSize: menuItemServingSize("serving_size").notNull(),
		diet: diet("diet").notNull(),
		availability: availability("availability").notNull().default("available"),
		// Scheduled availability — a separate axis from the manual sold-out
		// toggle above. Null/empty scheduleDays means every day; scheduleDays
		// holds 0 (Sunday) through 6 (Saturday), matching Postgres EXTRACT(DOW).
		// Start/end are always both null or both set (check constraint below);
		// a start after end wraps past midnight (e.g. 22:00-02:00) rather than
		// being rejected — a late-night window is a normal thing to want. The
		// wrap stays within the same calendar day as far as scheduleDays is
		// concerned: a Sat 22:00-02:00 window with scheduleDays [6] (Sat only)
		// does not cover Sunday 01:00 — day and time-of-day are independent
		// checks (both must pass), not one continuous span across days. Days
		// and time combine with AND: set both to mean "only Fri-Sun, 5-7 PM".
		// Evaluated fresh on every read (guest menu, cart, submit_order), never
		// by a background job — see is_menu_item_schedule_active() in
		// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql.
		scheduleDays: smallint("schedule_days").array(),
		scheduleStartTime: time("schedule_start_time"),
		scheduleEndTime: time("schedule_end_time"),
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
		check(
			"menu_items_schedule_time_check",
			sql`(${table.scheduleStartTime} is null) = (${table.scheduleEndTime} is null)`,
		),
	],
);
