import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { stationType } from "./enums.js";
import { createdAt, id } from "./helpers.js";
import { restaurants } from "./restaurant.js";
import { staff } from "./staff.js";

// One-time device-pairing codes (docs/architecture.md § Station Account
// Provisioning). code_hash, never the plaintext code — same reasoning as
// staff.pin_hash: single-use plus a short TTL doesn't need long-term
// secrecy, but there's no reason to store it recoverable either.
export const stationPairingCodes = pgTable("station_pairing_codes", {
	id: id(),
	restaurantId: uuid("restaurant_id")
		.notNull()
		.references(() => restaurants.id, { onDelete: "cascade" }),
	stationType: stationType("station_type").notNull(),
	codeHash: text("code_hash").notNull(),
	expiresAt: timestamp("expires_at", {
		withTimezone: true,
		mode: "string",
	}).notNull(),
	redeemedAt: timestamp("redeemed_at", {
		withTimezone: true,
		mode: "string",
	}),
	createdByStaffId: uuid("created_by_staff_id")
		.notNull()
		.references(() => staff.id),
	createdAt: createdAt(),
});
