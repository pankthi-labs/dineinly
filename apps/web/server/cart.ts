import type { Database } from "@workspace/db";
import type { Context } from "./trpc/context";
import { dbError } from "./trpc/errors";

// Shared by guest.ts and floor.ts: both read/write the same shared,
// session-scoped cart (docs/product.md § Shared Table Session), differing
// only in which client carries the caller's identity (ctx.supabase for a
// guest's own JWT, ctx.auth for staff) and, for writes, who gets attributed.
type CartClient = Context["auth"] | Context["supabase"];

type Spice = Database["public"]["Enums"]["spice"];
type Salt = Database["public"]["Enums"]["salt"];
type Ice = Database["public"]["Enums"]["ice"];

/** Cart lines joined with their menu item's current name/price/availability. */
export async function listCartItems(
	client: CartClient,
	restaurantId: string,
	sessionId: string,
) {
	const cartResult = await client
		.from("cart_items")
		.select("id, menu_item_id, quantity, spice, salt, ice")
		.eq("restaurant_id", restaurantId)
		.eq("session_id", sessionId)
		.order("created_at", { ascending: true });

	if (cartResult.error) {
		throw dbError("Unable to load the cart.", cartResult.error);
	}

	const rows = cartResult.data ?? [];
	const menuItemIds = [...new Set(rows.map((row) => row.menu_item_id))];
	const itemsResult =
		menuItemIds.length === 0
			? { data: [], error: null }
			: await client
					.from("menu_items")
					.select("id, name, price, availability, status")
					.eq("restaurant_id", restaurantId)
					.in("id", menuItemIds);

	if (itemsResult.error) {
		throw dbError("Unable to load the cart.", itemsResult.error);
	}

	const itemsById = new Map(
		(itemsResult.data ?? []).map((item) => [item.id, item]),
	);

	return rows.map((row) => {
		const menuItem = itemsById.get(row.menu_item_id);
		return {
			id: row.id,
			menuItemId: row.menu_item_id,
			quantity: row.quantity,
			spice: row.spice,
			salt: row.salt,
			ice: row.ice,
			name: menuItem?.name ?? "",
			price: menuItem?.price ?? 0,
			available:
				menuItem?.availability === "available" && menuItem?.status === "active",
		};
	});
}

/**
 * Add to Cart. Merges into an existing line on an exact menu item +
 * preference match (so repeated taps on a plain "+ Add" accumulate a
 * quantity instead of piling up duplicate rows); otherwise inserts a new
 * line — a customized re-add (different spice/salt/ice) is legitimately a
 * separate line.
 */
export async function upsertCartItem(
	client: CartClient,
	params: {
		restaurantId: string;
		sessionId: string;
		menuItemId: string;
		quantity: number;
		spice?: Spice | null;
		salt?: Salt | null;
		ice?: Ice | null;
		addedByType: "guest" | "staff" | "dineinly_admin";
		addedByStaffId?: string | null;
	},
): Promise<void> {
	let existingQuery = client
		.from("cart_items")
		.select("id, quantity")
		.eq("restaurant_id", params.restaurantId)
		.eq("session_id", params.sessionId)
		.eq("menu_item_id", params.menuItemId);
	existingQuery = params.spice
		? existingQuery.eq("spice", params.spice)
		: existingQuery.is("spice", null);
	existingQuery = params.salt
		? existingQuery.eq("salt", params.salt)
		: existingQuery.is("salt", null);
	existingQuery = params.ice
		? existingQuery.eq("ice", params.ice)
		: existingQuery.is("ice", null);

	const { data: existingRow, error: selectError } =
		await existingQuery.maybeSingle();
	if (selectError) {
		throw dbError("Unable to update the cart.", selectError);
	}

	const { error } = existingRow
		? await client
				.from("cart_items")
				.update({
					quantity: Math.min(99, existingRow.quantity + params.quantity),
				})
				.eq("id", existingRow.id)
		: await client.from("cart_items").insert({
				restaurant_id: params.restaurantId,
				session_id: params.sessionId,
				menu_item_id: params.menuItemId,
				quantity: params.quantity,
				spice: params.spice ?? null,
				salt: params.salt ?? null,
				ice: params.ice ?? null,
				added_by_type: params.addedByType,
				added_by_staff_id: params.addedByStaffId ?? null,
			});

	if (error) {
		throw dbError("Unable to update the cart.", error);
	}
}
