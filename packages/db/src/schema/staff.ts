import { sql } from "drizzle-orm";
import {
	index,
	pgTable,
	text,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { staffRole, staffStatus } from "./enums.js";
import { createdAt, id, updatedAt } from "./helpers.js";
import { restaurants } from "./restaurant.js";

// Identity + RBAC. `pinHash` is floor/kitchen attribution only — never a DB
// auth factor (see AGENTS.md guardrails). Soft-delete via `status = removed`.
//
// `userId` links this row to the Supabase Auth identity that actually
// logs in — RLS reads `auth.uid()` and matches it here. Owner/Manager: each
// individual's own Email OTP login. Kitchen/Waiter: the restaurant's one
// shared station account also gets its own Staff row (role = kitchen/
// waiter) linked the same way — the PIN that individually attributes a
// floor/kitchen action is a separate, app-level-only concept (see
// `cartItems.addedByStaffId` / `orders.placedByStaffId`) and never
// participates in auth or RLS.
//
// No typed `.references()` to `auth.users` here on purpose — see AGENTS.md
// / docs/architecture.md § Data: external Supabase schemas are never
// Drizzle-managed tables. The actual FK constraint is hand-written, in the
// custom migration alongside RLS (supabase/migrations/*_add_auth_fk_and_rls_policies.sql).
export const staff = pgTable(
	"staff",
	{
		id: id(),
		restaurantId: uuid("restaurant_id")
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		userId: uuid("user_id"),
		email: text("email").notNull(),
		role: staffRole("role").notNull(),
		pinHash: text("pin_hash"),
		status: staffStatus("status").notNull().default("invited"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		// Single-column, because both composite indexes below are partial —
		// neither can serve an unfiltered restaurant_id lookup however it's
		// prefixed.
		index("staff_restaurant_id_idx").on(table.restaurantId),
		// Partial: frees the email for re-invite once a staff member is removed.
		uniqueIndex("staff_restaurant_id_email_idx")
			.on(table.restaurantId, table.email)
			.where(sql`${table.status} <> 'removed'`),
		// One Supabase Auth identity maps to at most one active Staff row per
		// restaurant (it can still be staff at several different restaurants).
		uniqueIndex("staff_restaurant_id_user_id_idx")
			.on(table.restaurantId, table.userId)
			.where(sql`${table.userId} is not null and ${table.status} <> 'removed'`),
		// Composite-FK target: lets bills/cart_items/orders reference
		// (restaurant_id, id) together, so an attribution column can never
		// name a staff member from another restaurant — see bill.ts,
		// cart-item.ts, order.ts.
		unique("staff_restaurant_id_id_key").on(table.restaurantId, table.id),
	],
);
