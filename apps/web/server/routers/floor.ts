import { TRPCError } from "@trpc/server";
import { STATION_EMAIL_SUFFIX } from "@/lib/station-session";
import { listCartItems, upsertCartItem } from "../cart";
import type { Context } from "../trpc/context";
import { dbError } from "../trpc/errors";
import { authedProcedure, router } from "../trpc/init";
import { requireStaffRole } from "../trpc/rbac";
import {
	addCartItemInput,
	listCartInput,
	removeCartItemInput,
	setCartItemQuantityInput,
	submitFloorOrderInput,
} from "./floor.schema";

const FLOOR_ROLES = ["waiter", "manager", "owner"] as const;

// Order on behalf of guest (docs/product.md § RBAC "Add to Cart"/"Submit
// Order": Waiter/Manager/Owner). The cart itself is the same shared,
// session-scoped table guest.ts's cart procedures read and write — "any
// participant edits freely" (docs/product.md § Shared Table Session) means
// a staff-added line and a guest-added line coexist in the same list, only
// distinguished by addedByType/addedByStaffId (cart-item.ts). Reads/writes
// go through ctx.auth directly (staff_all_cart_items RLS, § 5 of the RLS
// migration, is any-active-staff) — only submitOrder needs the RPC, for the
// same idempotent cart-to-order transaction submit_order() gives guests.
export async function requireOwnStaffId(
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

	// The PIN cookie is valid for up to STATION_SESSION_TTL_SECONDS — re-verify
	// the acting staff row is still active and floor-eligible now, not just
	// at PIN entry, so a deactivation mid-shift takes effect immediately
	// instead of waiting out the cookie's expiry.
	const { data: actingStaff, error: actingStaffError } = await ctx.auth.rpc(
		"resolve_active_floor_staff",
		{ p_restaurant_id: restaurantId, p_staff_id: ctx.stationSession.staffId },
	);
	if (actingStaffError) {
		throw dbError("Unable to identify staff member.", actingStaffError);
	}
	if (!actingStaff?.[0]) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Enter your PIN to continue.",
		});
	}

	// Revocation is a server-side boundary, not just the Floor page's
	// redirect: a revoked tablet must stop mutating even if it never
	// re-renders. The device id comes from a signed cookie (lib/station-
	// session.ts), so a device can't rename itself out of a revocation.
	if (ctx.stationDeviceId) {
		const { data: revoked, error: revokedError } = await ctx.auth.rpc(
			"is_station_device_revoked",
			{ p_device_id: ctx.stationDeviceId },
		);
		if (revokedError) {
			throw dbError("Unable to verify this device.", revokedError);
		}
		if (revoked) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "This device was removed. Pair it again.",
			});
		}
	}

	return actingStaff[0].id;
}

export const floorRouter = router({
	cart: router({
		list: authedProcedure.input(listCartInput).query(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, [...FLOOR_ROLES]);

			return listCartItems(ctx.auth, input.restaurantId, input.sessionId);
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

				await upsertCartItem(ctx.auth, {
					restaurantId: input.restaurantId,
					sessionId: input.sessionId,
					menuItemId: input.menuItemId,
					quantity: input.quantity,
					spice: input.spice,
					salt: input.salt,
					ice: input.ice,
					addedByType: "staff",
					addedByStaffId: staffId,
				});
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
