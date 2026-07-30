import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
	(t) => [
		index("staff_restaurant_id_idx").on(t.restaurantId),
		// Partial: frees the email for re-invite once a staff member is removed.
		uniqueIndex("staff_restaurant_id_email_idx")
			.on(t.restaurantId, t.email)
			.where(sql`${t.status} <> 'removed'`),
		// One Supabase Auth identity maps to at most one active Staff row per
		// restaurant (it can still be staff at several different restaurants).
		uniqueIndex("staff_restaurant_id_user_id_idx")
			.on(t.restaurantId, t.userId)
			.where(sql`${t.userId} is not null and ${t.status} <> 'removed'`),
	],
);
