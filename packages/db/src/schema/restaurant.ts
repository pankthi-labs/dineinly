import { pgTable, text } from "drizzle-orm/pg-core";
import { restaurantExperience, restaurantStatus } from "./enums.js";
import { createdAt, id, updatedAt } from "./helpers.js";

// Tenant root. Restaurant settings folded in as columns — read on nearly
// every request, no join. Soft-delete via `status`, never hard-deleted.
// address/city/gstNumber/state/pincode are the bill header fields — null on
// Menu/Guest, which never generate a Dineinly bill (docs/product.md §
// Dineinly Experiences).
export const restaurants = pgTable("restaurants", {
	id: id(),
	name: text("name").notNull(),
	address: text("address"),
	city: text("city"),
	gstNumber: text("gst_number"),
	state: text("state"),
	pincode: text("pincode"),
	status: restaurantStatus("status").notNull().default("active"),
	// Which Dineinly package this restaurant runs — set at creation, changed
	// via the same admin edit flow. See restaurantExperience in enums.ts.
	experience: restaurantExperience("experience").notNull().default("one"),
	// Menu/Counter's shared universal QR (docs/core-data-model.md § Experience
	// Gating). Null unless experience is menu or counter — set only by
	// ensure_qr_token() the moment a restaurant becomes one of those. Neither
	// has a Table Matrix, so unlike Restaurant Table.qr_token resolving this
	// token never looks up an existing session — it always creates one (see
	// resolve_qr_token()). One column, not two: which behavior a scan gets
	// (view-only Menu vs order-taking Counter) is decided by the live
	// `experience` value, not by which column matched — so a restaurant
	// switching Menu<->Counter keeps the same printed QR instead of
	// alternating between two tokens.
	qrToken: text("qr_token").unique(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});
