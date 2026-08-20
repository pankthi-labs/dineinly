import { TRPCError } from "@trpc/server";
import type { Context } from "../trpc/context";
import { authedProcedure, router } from "../trpc/init";
import { requireStaffRole } from "../trpc/rbac";
import {
	addCartItemInput,
	listCartInput,
	removeCartItemInput,
	setCartItemQuantityInput,
	submitFloorOrderInput,
} from "./floor.schema";

function dbError(message: string, cause: unknown): TRPCError {
	return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause });
}

const FLOOR_ROLES = ["waiter", "manager", "owner"] as const;

const STATION_EMAIL_SUFFIX = "@stations.dineinly.internal";

// Order on behalf of guest (docs/product.md § RBAC "Add to Cart"/"Submit
// Order": Waiter/Manager/Owner). The cart itself is the same shared,
// session-scoped table guest.ts's cart procedures read and write — "any
// participant edits freely" (docs/product.md § Shared Table Session) means
// a staff-added line and a guest-added line coexist in the same list, only
// distinguished by addedByType/addedByStaffId (cart-item.ts). Reads/writes
// go through ctx.auth directly (staff_all_cart_items RLS, § 5 of the RLS
// migration, is any-active-staff) — only submitOrder needs the RPC, for the
// same idempotent cart-to-order transaction submit_order() gives guests.
async function requireOwnStaffId(
	ctx: Context,
	restaurantId: string,
): Promise<string> {
	const {
		data: { user },
	} = await ctx.auth.auth.getUser();

	const staffResult = await ctx.auth
		.from("staff")
		.select("id, email")
		.eq("restaurant_id", restaurantId)
		.eq("user_id", user?.id ?? "")
		.eq("status", "active")
		.in("role", FLOOR_ROLES)
		.maybeSingle();
	if (staffResult.error) {
		throw dbError("Unable to identify staff member.", staffResult.error);
	}
	if (!staffResult.data) {
		// Dineinly Admin has no Staff row — orders_placed_by_staff_id_check
		// requires one for placed_by_type = 'staff', so Admin can't place an
		// order on a restaurant's behalf the same way Waiter/Manager/Owner do.
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"Only an active Waiter, Manager, or Owner may order for a guest.",
		});
	}

	if (!staffResult.data.email.endsWith(STATION_EMAIL_SUFFIX)) {
		return staffResult.data.id;
	}

	// A shared station device's own Staff row is never the actor — the PIN-
	// resolved "acting" waiter is (docs/architecture.md § Station Account
	// Provisioning: PIN grants no DB access, attribution only). No valid
	// PIN cookie means nobody has unlocked this device yet.
	if (!ctx.stationSession || ctx.stationSession.restaurantId !== restaurantId) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Enter your PIN to continue.",
		});
	}
	return ctx.stationSession.staffId;
}

export const floorRouter = router({
	cart: router({
		list: authedProcedure.input(listCartInput).query(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, [...FLOOR_ROLES]);

			const cartResult = await ctx.auth
				.from("cart_items")
				.select("id, menu_item_id, quantity, spice, salt, ice")
				.eq("restaurant_id", input.restaurantId)
				.eq("session_id", input.sessionId)
				.order("created_at", { ascending: true });
			if (cartResult.error) {
				throw dbError("Unable to load the cart.", cartResult.error);
			}

			const rows = cartResult.data ?? [];
			const menuItemIds = [...new Set(rows.map((row) => row.menu_item_id))];
			const itemsResult =
				menuItemIds.length === 0
					? { data: [], error: null }
					: await ctx.auth
							.from("menu_items")
							.select("id, name, price, availability, status")
							.eq("restaurant_id", input.restaurantId)
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
						menuItem?.availability === "available" &&
						menuItem?.status === "active",
				};
			});
		}),

		// Merges into an existing line on an exact menu item + preference match,
		// same accumulation rule as guest.cart.addItem.
		addItem: authedProcedure
			.input(addCartItemInput)
			.mutation(async ({ ctx, input }) => {
				const staffId = await requireOwnStaffId(ctx, input.restaurantId);

				const sessionResult = await ctx.auth
					.from("table_sessions")
					.select("id")
					.eq("id", input.sessionId)
					.eq("restaurant_id", input.restaurantId)
					.eq("status", "active")
					.maybeSingle();
				if (sessionResult.error) {
					throw dbError("Unable to update the cart.", sessionResult.error);
				}
				if (!sessionResult.data) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "This table session is no longer active.",
					});
				}

				let existingQuery = ctx.auth
					.from("cart_items")
					.select("id, quantity")
					.eq("restaurant_id", input.restaurantId)
					.eq("session_id", input.sessionId)
					.eq("menu_item_id", input.menuItemId);
				existingQuery = input.spice
					? existingQuery.eq("spice", input.spice)
					: existingQuery.is("spice", null);
				existingQuery = input.salt
					? existingQuery.eq("salt", input.salt)
					: existingQuery.is("salt", null);
				existingQuery = input.ice
					? existingQuery.eq("ice", input.ice)
					: existingQuery.is("ice", null);

				const { data: existingRow, error: selectError } =
					await existingQuery.maybeSingle();
				if (selectError) {
					throw dbError("Unable to update the cart.", selectError);
				}

				const { error } = existingRow
					? await ctx.auth
							.from("cart_items")
							.update({
								quantity: Math.min(99, existingRow.quantity + input.quantity),
							})
							.eq("id", existingRow.id)
					: await ctx.auth.from("cart_items").insert({
							restaurant_id: input.restaurantId,
							session_id: input.sessionId,
							menu_item_id: input.menuItemId,
							quantity: input.quantity,
							spice: input.spice ?? null,
							salt: input.salt ?? null,
							ice: input.ice ?? null,
							added_by_type: "staff",
							added_by_staff_id: staffId,
						});
				if (error) {
					throw dbError("Unable to update the cart.", error);
				}
			}),

		setQuantity: authedProcedure
			.input(setCartItemQuantityInput)
			.mutation(async ({ ctx, input }) => {
				await requireStaffRole(ctx, input.restaurantId, [...FLOOR_ROLES]);

				const { error } =
					input.quantity === 0
						? await ctx.auth
								.from("cart_items")
								.delete()
								.eq("id", input.cartItemId)
								.eq("restaurant_id", input.restaurantId)
								.eq("session_id", input.sessionId)
						: await ctx.auth
								.from("cart_items")
								.update({ quantity: input.quantity })
								.eq("id", input.cartItemId)
								.eq("restaurant_id", input.restaurantId)
								.eq("session_id", input.sessionId);
				if (error) {
					throw dbError("Unable to update the cart.", error);
				}
			}),

		removeItem: authedProcedure
			.input(removeCartItemInput)
			.mutation(async ({ ctx, input }) => {
				await requireStaffRole(ctx, input.restaurantId, [...FLOOR_ROLES]);

				const { error } = await ctx.auth
					.from("cart_items")
					.delete()
					.eq("id", input.cartItemId)
					.eq("restaurant_id", input.restaurantId)
					.eq("session_id", input.sessionId);
				if (error) {
					throw dbError("Unable to update the cart.", error);
				}
			}),
	}),

	// Confirm Order, staff side. Delegates to staff_submit_order() (§ 9 of
	// the RLS migration) for the same atomic cart-to-order transition +
	// idempotency guest.ts's submitOrder gets from submit_order() — this
	// procedure only forwards the explicit ids + client-generated
	// idempotency key.
	submitOrder: authedProcedure
		.input(submitFloorOrderInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("staff_submit_order", {
				p_restaurant_id: input.restaurantId,
				p_session_id: input.sessionId,
				p_idempotency_key: input.idempotencyKey,
			});
			if (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error.message,
					cause: error,
				});
			}
			return { orderId: data as string };
		}),
});
