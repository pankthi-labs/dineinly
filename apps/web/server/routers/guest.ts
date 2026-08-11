import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { computeBill } from "@/lib/bill-math";
import { ICE_OPTIONS, SALT_OPTIONS, SPICE_OPTIONS } from "@/lib/menu-options";
import { guestProcedure, router } from "../trpc/init";

const preferencesInput = z.object({
	spice: z.enum(SPICE_OPTIONS).nullish(),
	salt: z.enum(SALT_OPTIONS).nullish(),
	ice: z.enum(ICE_OPTIONS).nullish(),
});

function dbError(message: string, cause: unknown): TRPCError {
	return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause });
}

// Guest-facing reads only. RLS (guest_select_own_restaurant,
// guest_select_active_menu_categories/items — supabase/migrations/
// 20260730150634_..._policies.sql § 3) already scopes every query below to
// this guest's own restaurant and to active-status rows; sold-out items
// still return (docs/product.md: sold-out must still show, just marked
// unavailable), so no availability filter here either.
export const guestRouter = router({
	menu: guestProcedure.query(async ({ ctx }) => {
		const [restaurantResult, categoriesResult, itemsResult] = await Promise.all(
			[
				ctx.supabase
					.from("restaurants")
					.select("name")
					.eq("id", ctx.guest.restaurant_id)
					.maybeSingle(),
				ctx.supabase
					.from("menu_categories")
					.select("id, name, sort")
					.eq("restaurant_id", ctx.guest.restaurant_id)
					.order("sort", { ascending: true }),
				ctx.supabase
					.from("menu_items")
					.select(
						"id, category_id, name, description, price, diet, availability, labels, prep_time, serving_size, offers_spice, offers_salt, offers_ice",
					)
					.eq("restaurant_id", ctx.guest.restaurant_id)
					.order("name", { ascending: true }),
			],
		);

		for (const result of [restaurantResult, categoriesResult, itemsResult]) {
			if (result.error) {
				throw dbError("Unable to load the menu.", result.error);
			}
		}

		if (!restaurantResult.data) {
			return null;
		}

		const items = itemsResult.data ?? [];

		return {
			restaurant: restaurantResult.data,
			tableLabel: ctx.guest.table_label,
			categories: (categoriesResult.data ?? []).map((category) => ({
				...category,
				items: items.filter((item) => item.category_id === category.id),
			})),
		};
	}),

	cart: router({
		// Shared, session-scoped cart (docs/product.md: "any participant edits
		// freely"). RLS (guest_*_session_cart_items) already scopes every read
		// and write below to this guest's own active session.
		list: guestProcedure.query(async ({ ctx }) => {
			const cartResult = await ctx.supabase
				.from("cart_items")
				.select("id, menu_item_id, quantity, spice, salt, ice")
				.eq("restaurant_id", ctx.guest.restaurant_id)
				.eq("session_id", ctx.guest.table_session_id)
				.order("created_at", { ascending: true });

			if (cartResult.error) {
				throw dbError("Unable to load the cart.", cartResult.error);
			}

			const rows = cartResult.data ?? [];
			const menuItemIds = [...new Set(rows.map((row) => row.menu_item_id))];

			const itemsResult =
				menuItemIds.length === 0
					? { data: [], error: null }
					: await ctx.supabase
							.from("menu_items")
							.select("id, name, price, availability, status")
							.eq("restaurant_id", ctx.guest.restaurant_id)
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

		// Add to Cart. Merges into an existing line when one already matches
		// this exact menu item + preference combination (so repeated taps on a
		// plain "+ Add" accumulate a quantity instead of piling up duplicate
		// rows); otherwise inserts a new line — a customized re-add (different
		// spice/salt/ice) is legitimately a separate line.
		addItem: guestProcedure
			.input(
				preferencesInput.extend({
					menuItemId: z.uuid(),
					quantity: z.number().int().min(1).max(99),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				let existingQuery = ctx.supabase
					.from("cart_items")
					.select("id, quantity")
					.eq("restaurant_id", ctx.guest.restaurant_id)
					.eq("session_id", ctx.guest.table_session_id)
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
					? await ctx.supabase
							.from("cart_items")
							.update({
								quantity: Math.min(99, existingRow.quantity + input.quantity),
							})
							.eq("id", existingRow.id)
					: await ctx.supabase.from("cart_items").insert({
							restaurant_id: ctx.guest.restaurant_id,
							session_id: ctx.guest.table_session_id,
							menu_item_id: input.menuItemId,
							quantity: input.quantity,
							spice: input.spice ?? null,
							salt: input.salt ?? null,
							ice: input.ice ?? null,
							added_by_type: "guest",
						});

				if (error) {
					throw dbError("Unable to update the cart.", error);
				}
			}),

		// Quantity 0 removes the line — the card stepper's "−" past 1 and the
		// review screen's stepper both route through here.
		setQuantity: guestProcedure
			.input(
				z.object({
					cartItemId: z.uuid(),
					quantity: z.number().int().min(0).max(99),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const { error } =
					input.quantity === 0
						? await ctx.supabase
								.from("cart_items")
								.delete()
								.eq("id", input.cartItemId)
								.eq("session_id", ctx.guest.table_session_id)
						: await ctx.supabase
								.from("cart_items")
								.update({ quantity: input.quantity })
								.eq("id", input.cartItemId)
								.eq("session_id", ctx.guest.table_session_id);

				if (error) {
					throw dbError("Unable to update the cart.", error);
				}
			}),

		removeItem: guestProcedure
			.input(z.object({ cartItemId: z.uuid() }))
			.mutation(async ({ ctx, input }) => {
				const { error } = await ctx.supabase
					.from("cart_items")
					.delete()
					.eq("id", input.cartItemId)
					.eq("session_id", ctx.guest.table_session_id);

				if (error) {
					throw dbError("Unable to update the cart.", error);
				}
			}),
	}),

	// Confirm Order. Atomic cart-to-order transition + idempotency both live
	// in the submit_order() Postgres function (docs/architecture.md §
	// Authorization & Idempotency) — this procedure only forwards the
	// client-generated idempotency key and translates the function's
	// exceptions (empty cart, item no longer available, closed session) into
	// a client-facing error.
	submitOrder: guestProcedure
		.input(z.object({ idempotencyKey: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.supabase.rpc("submit_order", {
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

	orders: router({
		// My Orders. Read-only (guest_select_session_orders/_order_items — same
		// migration § 3) — guests can view but never edit a placed order.
		// Guest-facing status is derived, never the internal per-item states
		// (docs/product.md: "guest never sees placed/ready granularity"):
		// Preparing (nothing served yet) → Partially Served → Served. Cancelled
		// items are dropped rather than shown crossed out — nothing in the
		// docs specifies guest-facing cancellation UI, and a silently
		// shortened order is less confusing than an unexplained strikethrough.
		list: guestProcedure.query(async ({ ctx }) => {
			const ordersResult = await ctx.supabase
				.from("orders")
				.select("id, placed_at")
				.eq("restaurant_id", ctx.guest.restaurant_id)
				.eq("session_id", ctx.guest.table_session_id)
				.order("placed_at", { ascending: true });

			if (ordersResult.error) {
				throw dbError("Unable to load your orders.", ordersResult.error);
			}

			const orders = ordersResult.data ?? [];
			if (orders.length === 0) return [];

			const itemsResult = await ctx.supabase
				.from("order_items")
				.select("order_id, item_name, quantity, status")
				.eq("restaurant_id", ctx.guest.restaurant_id)
				.in(
					"order_id",
					orders.map((order) => order.id),
				)
				.neq("status", "cancelled");

			if (itemsResult.error) {
				throw dbError("Unable to load your orders.", itemsResult.error);
			}

			const itemsByOrder = new Map<string, typeof itemsResult.data>();
			for (const item of itemsResult.data ?? []) {
				const list = itemsByOrder.get(item.order_id) ?? [];
				list.push(item);
				itemsByOrder.set(item.order_id, list);
			}

			return orders.map((order, index) => {
				const items = itemsByOrder.get(order.id) ?? [];
				const servedCount = items.filter(
					(item) => item.status === "served",
				).length;
				const status: "served" | "partially served" | "preparing" =
					items.length > 0 && servedCount === items.length
						? "served"
						: servedCount > 0
							? "partially served"
							: "preparing";

				return {
					id: order.id,
					number: index + 1,
					placedAt: order.placed_at,
					status,
					items: items.map((item) => ({
						name: item.item_name,
						quantity: item.quantity,
						served: item.status === "served",
					})),
				};
			});
		}),
	}),

	bill: router({
		// Request Bill (docs/product.md § Billing & Settlement). The
		// request_bill() Postgres function creates or moves the session's
		// Bill row to `requested`, idempotently. Amounts are derived on read
		// from order_items every call (docs/core-data-model.md: "derived on
		// read for presentation") — bills stores no line-item breakdown, only
		// the frozen totals a settle later writes.
		get: guestProcedure.query(async ({ ctx }) => {
			const { data: billId, error: rpcError } =
				await ctx.supabase.rpc("request_bill");
			if (rpcError) {
				throw dbError("Unable to open the bill.", rpcError);
			}

			const [restaurantResult, billResult, ordersResult] = await Promise.all([
				ctx.supabase
					.from("restaurants")
					.select("name, address, city, gst_number, state, pincode")
					.eq("id", ctx.guest.restaurant_id)
					.maybeSingle(),
				ctx.supabase
					.from("bills")
					.select("id, bill_number, status, service_charge_rate")
					.eq("id", billId)
					.maybeSingle(),
				ctx.supabase
					.from("orders")
					.select("id")
					.eq("restaurant_id", ctx.guest.restaurant_id)
					.eq("session_id", ctx.guest.table_session_id),
			]);

			for (const result of [restaurantResult, billResult, ordersResult]) {
				if (result.error) {
					throw dbError("Unable to load the bill.", result.error);
				}
			}
			if (!restaurantResult.data || !billResult.data) {
				throw dbError(
					"Unable to load the bill.",
					new Error("Missing restaurant or bill row"),
				);
			}

			const orderIds = (ordersResult.data ?? []).map((order) => order.id);
			const itemsResult =
				orderIds.length === 0
					? { data: [], error: null }
					: await ctx.supabase
							.from("order_items")
							.select("item_name, unit_price, tax_rate, quantity")
							.eq("restaurant_id", ctx.guest.restaurant_id)
							.in("order_id", orderIds)
							.neq("status", "cancelled");

			if (itemsResult.error) {
				throw dbError("Unable to load the bill.", itemsResult.error);
			}

			const totals = computeBill(
				(itemsResult.data ?? []).map((row) => ({
					name: row.item_name,
					unitPrice: Number(row.unit_price),
					quantity: row.quantity,
					taxRate: Number(row.tax_rate),
				})),
				Number(billResult.data.service_charge_rate ?? 0),
			);

			return {
				restaurant: {
					name: restaurantResult.data.name,
					address: restaurantResult.data.address,
					city: restaurantResult.data.city,
					gstNumber: restaurantResult.data.gst_number,
					state: restaurantResult.data.state,
					pincode: restaurantResult.data.pincode,
				},
				tableLabel: ctx.guest.table_label,
				billId: billResult.data.id,
				billNumber: billResult.data.bill_number,
				status: billResult.data.status,
				// service_charge_rate is numeric(5,4), so as a percent it
				// carries at most 2 decimals — rounding there keeps float
				// round-trip noise out of the guest-facing label.
				serviceChargeRatePercent:
					Math.round(Number(billResult.data.service_charge_rate ?? 0) * 10000) /
					100,
				...totals,
			};
		}),
	}),
});
