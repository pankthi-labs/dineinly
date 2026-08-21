import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { stationType } from "./enums.js";
import { createdAt, id } from "./helpers.js";
import { restaurants } from "./restaurant.js";

// Per-device pairing registry (docs/architecture.md § Station Account
// Provisioning, "Per-device revocation"). Doesn't store Supabase's own
// refresh token — GoTrue owns that. `revokedAt` is checked on every
// floor-page server load (apps/web/app/restaurants/[restaurantId]/floor/
// layout.tsx), not enforced instantly mid-session — see the design spec's
// Non-Goals.
export const stationDevices = pgTable("station_devices", {
	id: id(),
	restaurantId: uuid("restaurant_id")
		.notNull()
		.references(() => restaurants.id, { onDelete: "cascade" }),
	stationType: stationType("station_type").notNull(),
	createdAt: createdAt(),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
});
