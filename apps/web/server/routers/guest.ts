import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { billableQuantity, computeBill } from "@/lib/bill-math";
import { ICE_OPTIONS, SALT_OPTIONS, SPICE_OPTIONS } from "@/lib/menu-options";
import { listCartItems, upsertCartItem } from "../cart";
import { dbError } from "../trpc/errors";
import { guestProcedure, router } from "../trpc/init";

const preferencesInput = z.object({
	spice: z.enum(SPICE_OPTIONS).nullish(),
	salt: z.enum(SALT_OPTIONS).nullish(),
	ice: z.enum(ICE_OPTIONS).nullish(),
});

// docs/product.md § Dineinly Experiences: Menu is view-only (no ordering, no
// order history). Guest adds ordering and a plain order history, but no live
// status (nobody in Dineinly ever advances an item's status for Guest, so a
// status ladder would just hang on "Preparing" forever) and no bill (staff
// runs billing outside Dineinly). One is the full dine-in experience —
// ordering, live status, and bill. Counter also reaches this router (its
// tableless sessions resolve through the same guest JWT/session shape —
// see resolve_qr_token()) and gets bill access too, since the bill_number
// doubles as the guest's counter token (docs/core-data-model.md).
function requireOrderingEnabled(experience: string): void {
	if (experience === "menu") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "This restaurant's menu is view-only.",
		});
	}
}

function requireBillEnabled(experience: string): void {
	if (experience !== "one" && experience !== "counter") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Billing isn't available here.",
		});
	}
}

// Guest-facing reads only. RLS (guest_select_own_restaurant,
// guest_select_active_menu_categories/items — supabase/migrations/
// 20260730150634_..._policies.sql § 3) already scopes every query below to
// this guest's own restaurant and to active-status rows; sold-out items
// still return (docs/product.md: sold-out must still show, just marked
// unavailable), so no availability filter here either.
export const guestRouter = router({
	// Realtime bootstrap: the guest JWT lives in an httpOnly cookie (never
	// reaches client JS directly), so the browser calls this once to get the
	// raw token for supabase.realtime.setAuth() plus the ids it needs to
	// build session:{id}/menu:{id} topic strings (apps/web/lib/realtime).
	// Handing back the token doesn't widen what the browser can already do —
	// every guestProcedure call already runs authenticated as this guest.
	realtimeAuth: guestProcedure.query(({ ctx }) => ({
		token: ctx.guestToken,
		restaurantId: ctx.guest.restaurant_id,
		sessionId: ctx.guest.session_id,
	})),

	menu: guestProcedure.query(async ({ ctx }) => {
		const [restaurantResult, categoriesResult, itemsResult] = await Promise.all(
			[
				ctx.supabase
					.from("restaurants")
					.select("name, experience")
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
		list: guestProcedure.query(async ({ ctx }) =>
			listCartItems(
				ctx.supabase,
				ctx.guest.restaurant_id,
				ctx.guest.session_id,
			),
		),

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
				requireOrderingEnabled(ctx.experience);

				await upsertCartItem(ctx.supabase, {
					restaurantId: ctx.guest.restaurant_id,
					sessionId: ctx.guest.session_id,
					menuItemId: input.menuItemId,
					quantity: input.quantity,
					spice: input.spice,
					salt: input.salt,
					ice: input.ice,
					addedByType: "guest",
				});
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
								.eq("session_id", ctx.guest.session_id)
						: await ctx.supabase
								.from("cart_items")
								.update({ quantity: input.quantity })
								.eq("id", input.cartItemId)
								.eq("session_id", ctx.guest.session_id);

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
					.eq("session_id", ctx.guest.session_id);

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
			requireOrderingEnabled(ctx.experience);

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
			requireOrderingEnabled(ctx.experience);

			const ordersResult = await ctx.supabase
				.from("orders")
				.select("id, placed_at, bill_id")
				.eq("restaurant_id", ctx.guest.restaurant_id)
				.eq("session_id", ctx.guest.session_id)
				.order("placed_at", { ascending: true });

			if (ordersResult.error) {
				throw dbError("Unable to load your orders.", ordersResult.error);
			}

			let orders = ordersResult.data ?? [];
			if (orders.length === 0) return [];

			// Counter-experience gate (docs/core-data-model.md § Lifecycle
			// invariants): an order's items are still "Awaiting Payment" until
			// its own bill settles — that state is already shown in full on the
			// bill screen's line-item table, so this My Orders/status-ladder
			// view only ever covers a round once it's actually paid. Without
			// this, an in-flight later round (Add More Items before settling)
			// would show its unpaid items mixed into "Ready to send" here, where
			// tapping Send to Kitchen would just fail server-side.
			if (ctx.experience === "counter") {
				const billIds = [
					...new Set(
						orders
							.map((order) => order.bill_id)
							.filter((id): id is string => id != null),
					),
				];
				const billsResult =
					billIds.length === 0
						? { data: [], error: null }
						: await ctx.supabase
								.from("bills")
								.select("id, status")
								.in("id", billIds);
				if (billsResult.error) {
					throw dbError("Unable to load your orders.", billsResult.error);
				}
				const settledBillIds = new Set(
					(billsResult.data ?? [])
						.filter((bill) => bill.status === "settled")
						.map((bill) => bill.id),
				);
				orders = orders.filter(
					(order) => order.bill_id != null && settledBillIds.has(order.bill_id),
				);
				if (orders.length === 0) return [];
			}

			const itemsResult = await ctx.supabase
				.from("order_items")
				.select(
					"id, order_id, item_name, menu_item_id, quantity, cancelled_quantity, status, released_at, spice, salt, ice",
				)
				.eq("restaurant_id", ctx.guest.restaurant_id)
				.in(
					"order_id",
					orders.map((order) => order.id),
				)
				.neq("status", "cancelled");

			if (itemsResult.error) {
				throw dbError("Unable to load your orders.", itemsResult.error);
			}

			// A partially cancelled 'placed' row still carries its full ordered
			// quantity — only the remaining, still-billable units should ever
			// reach the guest, same as the kitchen queue (kitchen.ts).
			const itemsByOrder = new Map<string, typeof itemsResult.data>();
			for (const item of itemsResult.data ?? []) {
				if (item.quantity - item.cancelled_quantity <= 0) continue;
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
						id: item.id,
						name: item.item_name,
						menuItemId: item.menu_item_id,
						quantity: item.quantity - item.cancelled_quantity,
						spice: item.spice,
						salt: item.salt,
						ice: item.ice,
						served: item.status === "served",
						// Counter-only distinction (docs/core-data-model.md §
						// Lifecycle invariants: "Counter shows its own mapping, e.g.
						// Preparing -> Ready for Pickup") — Full-Service ignores this
						// and keeps grouping purely on `served`.
						ready: item.status === "ready",
						// Counter only (always true elsewhere, since nothing gates
						// Full-Service's kitchen fire): whether the guest has sent
						// this paid item to the kitchen yet.
						released: item.released_at != null,
					})),
				};
			});
		}),

		// Counter only: the guest's own per-item kitchen release
		// (release_order_item_to_kitchen(), RLS migration § "Guest ordering") —
		// gated there on the item belonging to this guest's own session and the
		// bill being settled, so a stale/racing tap fails cleanly rather than
		// silently releasing an item on an unpaid or already-served order.
		// Accepts more than one id at once: a merged "Ready to send" row (same
		// dish + preferences repeated across separate confirm-cart rounds,
		// apps/web/lib/order-groups.ts) sends every underlying order_item in
		// one tap. The RPC itself only ever handles one row — same shape as
		// kitchen.ts's advanceBatch batching over a single-item RPC/update.
		release: guestProcedure
			.input(z.object({ orderItemIds: z.array(z.uuid()).min(1) }))
			.mutation(async ({ ctx, input }) => {
				requireOrderingEnabled(ctx.experience);

				// Concurrent, not sequential — the RPC re-validates each row on its
				// own (session ownership, bill settled), so one failing id must not
				// block the others in the same merged line from still going through.
				const results = await Promise.allSettled(
					input.orderItemIds.map((orderItemId) =>
						ctx.supabase.rpc("release_order_item_to_kitchen", {
							p_order_item_id: orderItemId,
						}),
					),
				);
				const failure = results.find(
					(result) => result.status === "rejected" || result.value.error,
				);
				if (failure) {
					const error =
						failure.status === "rejected"
							? failure.reason
							: failure.value.error;
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: error?.message ?? "Unable to send an item to the kitchen.",
						cause: error,
					});
				}
			}),

		// Counter only: the guest's own self-service correction on a still-open
		// bill (docs/product.md § Order Lifecycle) — reduce a line's quantity or
		// cancel it outright (0) any time before settle, since nothing has
		// reached the kitchen yet. set_order_item_quantity() does the real
		// enforcement (own session, own restaurant's experience, bill not
		// settled, decrease-only) — this procedure only forwards the call and
		// translates its exception.
		setQuantity: guestProcedure
			.input(
				z.object({
					orderItemId: z.uuid(),
					quantity: z.number().int().min(0).max(99),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				requireOrderingEnabled(ctx.experience);

				const { error } = await ctx.supabase.rpc("set_order_item_quantity", {
					p_order_item_id: input.orderItemId,
					p_quantity: input.quantity,
				});

				if (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: error.message,
						cause: error,
					});
				}
			}),
	}),

	bill: router({
		// Live running total — read-only, no side effect. Works whether or
		// not a `bills` row exists yet (pre-request: no row, virtual "open"
		// status, same pattern as the staff Bills tab). Guests use this to
		// check "how much so far" without it signaling staff they're ready to
		// pay — that's the separate `request` mutation below. Amounts are
		// derived on read from order_items every call (docs/core-data-model.md:
		// "derived on read for presentation") — bills stores no line-item
		// breakdown, only the frozen totals a settle later writes.
		get: guestProcedure.query(async ({ ctx }) => {
			requireBillEnabled(ctx.experience);

			const [restaurantResult, billsResult] = await Promise.all([
				ctx.supabase
					.from("restaurants")
					.select("name, address, city, gst_number, state, pincode")
					.eq("id", ctx.guest.restaurant_id)
					.maybeSingle(),
				// Every bill this session has ever drawn, oldest first — a session
				// can carry more than one (Counter: settle, then order again,
				// docs/core-data-model.md § Lifecycle invariants). The last row is
				// this round's current, actionable bill; every earlier one is
				// already-settled history (otherBills below).
				ctx.supabase
					.from("bills")
					.select("id, bill_number, daily_token, status, total, settled_at")
					.eq("session_id", ctx.guest.session_id)
					.order("created_at", { ascending: true }),
			]);

			for (const result of [restaurantResult, billsResult]) {
				if (result.error) {
					throw dbError("Unable to load the bill.", result.error);
				}
			}
			if (!restaurantResult.data) {
				throw dbError(
					"Unable to load the bill.",
					new Error("Missing restaurant"),
				);
			}

			// This round's orders only — a session with no bill yet (nothing to
			// scope by) falls back to every order it has (there's no prior round
			// to accidentally re-sum in that case).
			const bills = billsResult.data ?? [];
			const bill = bills.at(-1) ?? null;
			const otherBills = bill ? bills.slice(0, -1) : [];
			const ordersResult = await ctx.supabase
				.from("orders")
				.select("id")
				.eq("restaurant_id", ctx.guest.restaurant_id)
				.eq(
					bill ? "bill_id" : "session_id",
					bill ? bill.id : ctx.guest.session_id,
				);
			if (ordersResult.error) {
				throw dbError("Unable to load the bill.", ordersResult.error);
			}

			const orderIds = (ordersResult.data ?? []).map((order) => order.id);
			const itemsResult =
				orderIds.length === 0
					? { data: [], error: null }
					: await ctx.supabase
							.from("order_items")
							.select(
								"id, item_name, unit_price, tax_rate, quantity, waived_quantity, cancelled_quantity, spice, salt, ice, menu_item_id",
							)
							.eq("restaurant_id", ctx.guest.restaurant_id)
							.in("order_id", orderIds)
							.neq("status", "cancelled");

			if (itemsResult.error) {
				throw dbError("Unable to load the bill.", itemsResult.error);
			}

			const status: "open" | "requested" | "settled" = bill?.status ?? "open";

			// Counter only, pre-settle: the raw per-line rows behind the
			// aggregated `lines` below, so the guest can reduce/cancel one
			// specific line (guest.orders.setQuantity) — every experience uses
			// `lines` for display, but only Counter pre-settle needs individual
			// order_item ids to edit against, so this stays empty everywhere
			// else rather than shipping ids nothing on the client will ever use.
			const editableItems =
				ctx.experience === "counter" && status !== "settled"
					? (itemsResult.data ?? [])
							.filter((row) => row.quantity - row.cancelled_quantity > 0)
							.map((row) => ({
								id: row.id,
								name: row.item_name,
								quantity: row.quantity - row.cancelled_quantity,
								spice: row.spice,
								salt: row.salt,
								ice: row.ice,
							}))
					: [];
			const totals = computeBill(
				(itemsResult.data ?? [])
					.map((row) => ({
						name: row.item_name,
						unitPrice: Number(row.unit_price),
						quantity: billableQuantity(
							row.quantity,
							row.waived_quantity,
							row.cancelled_quantity,
						),
						taxRate: Number(row.tax_rate),
						spice: row.spice,
						salt: row.salt,
						ice: row.ice,
					}))
					.filter((row) => row.quantity > 0),
			);

			// This round's already-ordered quantity per menu item (ignoring
			// waived, which is a billing correction rather than a change in what
			// was actually ordered) — lets the guest menu show "you already have
			// 2 of these this round" instead of resetting to 0 after a confirmed
			// order clears the cart.
			const itemQuantitiesByMenuItem: Record<string, number> = {};
			for (const row of itemsResult.data ?? []) {
				if (!row.menu_item_id) continue;
				const remaining = row.quantity - row.cancelled_quantity;
				if (remaining <= 0) continue;
				itemQuantitiesByMenuItem[row.menu_item_id] =
					(itemQuantitiesByMenuItem[row.menu_item_id] ?? 0) + remaining;
			}

			return {
				// A Bill only ever exists on One/Counter, which require these fields
				// at creation (restaurantFieldsSchema's refineBillingDetails) — null
				// only on Menu/Guest, which never reach this procedure.
				restaurant: {
					name: restaurantResult.data.name,
					address: restaurantResult.data.address as string,
					city: restaurantResult.data.city as string,
					gstNumber: restaurantResult.data.gst_number as string,
					state: restaurantResult.data.state as string,
					pincode: restaurantResult.data.pincode as string,
				},
				tableLabel: ctx.guest.table_label,
				billId: bill?.id ?? null,
				billNumber: bill?.bill_number ?? null,
				dailyToken: bill?.daily_token ?? null,
				status,
				// Every earlier round of this same visit (Counter only, in
				// practice) — shown as separate settled receipts, never summed
				// into one running total (each was already its own payment).
				otherBills: otherBills.map((b) => ({
					billId: b.id,
					billNumber: b.bill_number,
					dailyToken: b.daily_token,
					total: Number(b.total ?? 0),
					settledAt: b.settled_at,
				})),
				itemQuantitiesByMenuItem,
				editableItems,
				...totals,
			};
		}),

		// Full receipt for one of this session's earlier rounds (the otherBills
		// list `get` above returns) — reached from the guest's Past Bills page,
		// which lets them pick a token from a dropdown rather than only ever
		// seeing the current round's line items. Scoped to this guest's own
		// session, same as every other query here; every bill this reaches is
		// already settled (it only ever shows up in otherBills once a later
		// round exists), so totals are the frozen row, not a live recompute.
		getPast: guestProcedure
			.input(z.object({ billId: z.uuid() }))
			.query(async ({ ctx, input }) => {
				requireBillEnabled(ctx.experience);

				const [restaurantResult, billResult] = await Promise.all([
					ctx.supabase
						.from("restaurants")
						.select("name, address, city, gst_number, state, pincode")
						.eq("id", ctx.guest.restaurant_id)
						.maybeSingle(),
					ctx.supabase
						.from("bills")
						.select(
							"id, bill_number, daily_token, status, subtotal, total, settled_at",
						)
						.eq("id", input.billId)
						.eq("session_id", ctx.guest.session_id)
						.maybeSingle(),
				]);

				for (const result of [restaurantResult, billResult]) {
					if (result.error) {
						throw dbError("Unable to load the bill.", result.error);
					}
				}
				if (!restaurantResult.data) {
					throw dbError(
						"Unable to load the bill.",
						new Error("Missing restaurant"),
					);
				}
				if (!billResult.data) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Bill not found.",
					});
				}
				const bill = billResult.data;

				const ordersResult = await ctx.supabase
					.from("orders")
					.select("id")
					.eq("restaurant_id", ctx.guest.restaurant_id)
					.eq("bill_id", bill.id);
				if (ordersResult.error) {
					throw dbError("Unable to load the bill.", ordersResult.error);
				}

				const orderIds = (ordersResult.data ?? []).map((order) => order.id);
				const itemsResult =
					orderIds.length === 0
						? { data: [], error: null }
						: await ctx.supabase
								.from("order_items")
								.select(
									"item_name, unit_price, tax_rate, quantity, waived_quantity, cancelled_quantity, spice, salt, ice",
								)
								.eq("restaurant_id", ctx.guest.restaurant_id)
								.in("order_id", orderIds)
								.neq("status", "cancelled");
				if (itemsResult.error) {
					throw dbError("Unable to load the bill.", itemsResult.error);
				}

				// Only the line/tax-slab breakdown is recomputed here (never stored
				// on the row) — the subtotal/total themselves come straight from the
				// frozen row, same as the staff bill detail page.
				const computed = computeBill(
					(itemsResult.data ?? [])
						.map((row) => ({
							name: row.item_name,
							unitPrice: Number(row.unit_price),
							quantity: billableQuantity(
								row.quantity,
								row.waived_quantity,
								row.cancelled_quantity,
							),
							taxRate: Number(row.tax_rate),
							spice: row.spice,
							salt: row.salt,
							ice: row.ice,
						}))
						.filter((row) => row.quantity > 0),
				);

				return {
					restaurant: {
						name: restaurantResult.data.name,
						address: restaurantResult.data.address as string,
						city: restaurantResult.data.city as string,
						gstNumber: restaurantResult.data.gst_number as string,
						state: restaurantResult.data.state as string,
						pincode: restaurantResult.data.pincode as string,
					},
					tableLabel: ctx.guest.table_label,
					billId: bill.id,
					billNumber: bill.bill_number,
					dailyToken: bill.daily_token,
					status: bill.status as "open" | "requested" | "settled",
					settledAt: bill.settled_at,
					lines: computed.lines,
					subtotal: Number(bill.subtotal ?? 0),
					taxSlabs: computed.taxSlabs,
					total: Number(bill.total ?? 0),
				};
			}),

		// Request Bill (docs/product.md § Billing & Settlement) — the explicit
		// guest action, separate from viewing. Only this moves the session's
		// Bill row to `requested` (creating it if needed); `get` above never
		// does, so a guest merely checking their running total doesn't
		// silently signal staff they're ready to pay. request_bill() reads
		// restaurant_id/session_id off this guest's own JWT claims, so
		// no input is needed.
		request: guestProcedure.mutation(async ({ ctx }) => {
			requireBillEnabled(ctx.experience);

			const { data: billId, error } = await ctx.supabase.rpc("request_bill");
			if (error) {
				throw dbError("Unable to request the bill.", error);
			}
			return { billId };
		}),
	}),
});
