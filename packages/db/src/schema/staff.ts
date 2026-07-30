import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { staffRole, staffStatus } from "./enums.js";
import { createdAt, id, updatedAt } from "./helpers.js";
import { restaurants } from "./restaurant.js";

// Identity + RBAC. `pinHash` is floor/kitchen attribution only — never a DB
// auth factor (see AGENTS.md guardrails). Soft-delete via `status = removed`.
export const staff = pgTable(
	"staff",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: staffRole("role").notNull(),
		pinHash: text("pin_hash"),
		status: staffStatus("status").notNull().default("invited"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(t) => [
		index("staff_restaurant_id_idx").on(t.restaurantId),
		// Partial: frees the email for re-invite once a staff member is removed.
		uniqueIndex("staff_restaurant_id_email_idx")
			.on(t.restaurantId, t.email)
			.where(sql`${t.status} <> 'removed'`),
	],
);
