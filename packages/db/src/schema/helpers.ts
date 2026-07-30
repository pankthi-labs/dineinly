import { timestamp, uuid } from "drizzle-orm/pg-core";

// Shared column builders. Each is a factory (not a shared instance) — Drizzle
// column builders are single-use per table.

export const id = () => uuid("id").defaultRandom().primaryKey();

export const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const updatedAt = () =>
	timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date());
