import { date, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { restaurants } from "./restaurant.js";

// Backs bills.daily_token: one row per restaurant per calendar day
// (Asia/Kolkata), incremented atomically by next_daily_token() via
// INSERT ... ON CONFLICT DO UPDATE. No id/timestamps — the composite key is
// the whole row, nothing else is ever read from it besides the running count.
export const restaurantDailyTokens = pgTable(
	"restaurant_daily_tokens",
	{
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		tokenDate: date("token_date").notNull(),
		lastToken: integer("last_token").notNull().default(0),
	},
	(table) => [
		primaryKey({
			columns: [table.restaurantId, table.tokenDate],
			name: "restaurant_daily_tokens_restaurant_id_token_date_pk",
		}),
	],
);
