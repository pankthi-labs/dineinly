import { timestamp, uuid } from "drizzle-orm/pg-core";

// Shared column builders. Each is a factory (not a shared instance) — Drizzle
// column builders are single-use per table.

export const id = () => uuid("id").defaultRandom().primaryKey();

// mode: "string" carries every timestamp as a plain ISO string end to end
// (docs/tech-stack.md § Wire serialization), rather than a Date object
// that would need a tRPC transformer to survive the wire.
export const createdAt = () =>
	timestamp("created_at", { withTimezone: true, mode: "string" })
		.defaultNow()
		.notNull();

export const updatedAt = () =>
	timestamp("updated_at", { withTimezone: true, mode: "string" })
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date().toISOString());
