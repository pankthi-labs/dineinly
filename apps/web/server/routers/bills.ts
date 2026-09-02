import { TRPCError } from "@trpc/server";
import type { StaffRole } from "@/lib/auth";
import { billableQuantity, computeBill } from "@/lib/bill-math";
import { buildBillPdf } from "@/lib/bill-pdf";
import type { Context } from "../trpc/context";
import { dbError } from "../trpc/errors";
import { authedProcedure, router } from "../trpc/init";
import { requireFullServiceRole } from "../trpc/rbac";
import {
	cancelOrderItemInput,
	closeSessionInput,
	downloadBillPdfInput,
	forceTerminateSessionInput,
	getBillInput,
	listBillsInput,
	releaseOrderItemInput,
	requestBillInput,
	setOrderItemQuantityInput,
	settleBillInput,
	waiveOrderItemInput,
} from "./bills.schema";

// Every Bills write (docs/product.md § RBAC) excludes Kitchen only.
const BILLS_WRITE_ROLES: StaffRole[] = ["waiter", "manager", "owner"];

// A day's [start, end) as local-server-time ISO bounds — the app has no
// per-restaurant timezone setting (core-data-model.md lists no such
// column), so "Today" means the server's own calendar day, same as every
// other timestamp in the app. `date` narrows this to one exact past day
// instead of today.
function dateRangeFor(date: string | undefined): {
	start: string;
	end: string;
} {
	const start = date ? new Date(`${date}T00:00:00`) : new Date();
	if (!date) start.setHours(0, 0, 0, 0);
	const end = new Date(start);
	end.setDate(end.getDate() + 1);
	return { start: start.toISOString(), end: end.toISOString() };
}

type BillableItem = {
	name: string;
	unitPrice: number;
	quantity: number;
	taxRate: number;
};

// Shared by list (per-session subtotal) and get (full line detail): an
// "open" or "requested" bill's total is always derived live from
// order_items (core-data-model.md — only settle freezes it), so both call
// sites need the same non-cancelled-items-through-computeBill math the
// guest bill screen already uses (apps/web/server/routers/guest.ts).
function liveTotal(items: BillableItem[]): number {
	return computeBill(items).total;
}

// Shared by cancelOrderItem and waiveOrderItem: an item's cancelled and
// waived quantities are independent corrections drawn from the same pool
// (docs/core-data-model.md — their sum can never exceed quantity, enforced
// again at the DB with order_items_waived_cancelled_quantity_check), so
// setting one has to know how much the other has already claimed.
function assertWithinRemaining(
	action: "cancel" | "waive",
	requested: number,
	quantity: number,
	otherQuantity: number,
): void {
	if (requested > quantity) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Can't ${action} more than the ordered quantity.`,
		});
	}
	if (requested + otherQuantity > quantity) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Can't ${action} more than the quantity still remaining.`,
		});
	}
}

// Shared by cancelOrderItem and waiveOrderItem: both corrections are blocked
// once the item's bill is settled (docs/product.md § Bills tab: "Unavailable
// once the bill is settled, even if an item is technically still placed") —
// a correction after settle wouldn't reach the frozen total, which would
// silently make the printed bill wrong. Derived from the item's own order
// rather than trusting a client-supplied sessionId, so a mismatched
// sessionId can't bypass the check for an item in a different session.
async function assertBillNotSettled(
	auth: Context["auth"],
	orderId: string,
	errorMessage: string,
): Promise<void> {
	const orderResult = await auth
		.from("orders")
		.select("bill_id")
		.eq("id", orderId)
		.maybeSingle();
	if (orderResult.error) throw dbError(errorMessage, orderResult.error);
	if (!orderResult.data) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
	}
	// No bill drawn yet for this order's round (One/Guest, pre-Request Bill)
	// — nothing frozen, so nothing to block.
	if (!orderResult.data.bill_id) return;

	const billResult = await auth
		.from("bills")
		.select("status")
		.eq("id", orderResult.data.bill_id)
		.maybeSingle();
	if (billResult.error) throw dbError(errorMessage, billResult.error);
	if (billResult.data?.status === "settled") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This bill is already settled and can no longer be corrected.",
		});
	}
}

// list/get/downloadPdf (read) stay open to any active staff member —
// staff_all_sessions/staff_all_bills/staff_all_cart_items RLS
// (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 5)
// scope every query below to the caller's own restaurant. Every write is
// Waiter/Manager/Owner only (Request/Settle/Close/Force-Terminate/correct —
// docs/product.md § RBAC all exclude Kitchen), enforced via
// requireFullServiceRole below; closeSession's is inside close_session()
// itself (§ 14 of that migration) since it's a SECURITY INVOKER RPC, not a
// plain ctx.auth write.
export const billsRouter = router({
	// Bills tab list (docs/product.md § Billing & Settlement): one row per
	// bill row, not per session — a session can carry more than one bill
	// over its life (Counter: settle, then order again), and each round is
	// its own independently visible/filterable/accessible entry, with its
	// own token. A session that's never had "Request Bill" pressed has no
	// bills row at all yet (request_bill() only ever inserts one already
	// `requested`), so it gets one synthetic "open" row instead. Every
	// currently active session is always included (today's business,
	// regardless of the date filter); the date filter only bounds the
	// *closed* history so past days don't grow unbounded.
	list: authedProcedure.input(listBillsInput).query(async ({ ctx, input }) => {
		const range = dateRangeFor(input.date);

		const closedQuery = ctx.auth
			.from("sessions")
			.select("id, restaurant_id, status, opened_at, closed_at")
			.eq("restaurant_id", input.restaurantId)
			.eq("status", "closed")
			.gte("closed_at", range.start)
			.lt("closed_at", range.end);

		// Active sessions have no closed_at to filter by, and are always
		// today's business — only pull them in on the default "Today" view.
		// A past date shouldn't show a table that's still currently open.
		const activeQuery = input.date
			? Promise.resolve({ data: [], error: null })
			: ctx.auth
					.from("sessions")
					.select("id, restaurant_id, status, opened_at, closed_at")
					.eq("restaurant_id", input.restaurantId)
					.eq("status", "active");

		const [activeResult, closedResult] = await Promise.all([
			activeQuery,
			closedQuery,
		]);

		for (const result of [activeResult, closedResult]) {
			if (result.error) throw dbError("Unable to load bills.", result.error);
		}

		const sessions = [
			...(activeResult.data ?? []),
			...(closedResult.data ?? []),
		];
		if (sessions.length === 0) return [];

		const sessionIds = sessions.map((s) => s.id);

		const [billsResult, tablesResult, ordersResult] = await Promise.all([
			ctx.auth
				.from("bills")
				.select(
					"id, session_id, bill_number, daily_token, status, total, settled_at, created_at",
				)
				.eq("restaurant_id", input.restaurantId)
				.in("session_id", sessionIds)
				// Ascending: a session can carry more than one bill (Counter:
				// settle, then order again), and each list below is built oldest
				// first, same order used everywhere else a session's bills are
				// listed (bills.get, guest.bill.get).
				.order("created_at", { ascending: true }),
			ctx.auth
				.from("restaurant_tables")
				.select("session_id, label")
				.eq("restaurant_id", input.restaurantId)
				.in("session_id", sessionIds),
			ctx.auth
				.from("orders")
				.select("id, session_id, bill_id")
				.eq("restaurant_id", input.restaurantId)
				.in("session_id", sessionIds),
		]);

		for (const result of [billsResult, tablesResult, ordersResult]) {
			if (result.error) throw dbError("Unable to load bills.", result.error);
		}

		// One session can hold more than one bill (Counter: settle, then order
		// again) — every one of them gets its own row below, so this stays a
		// multi-map rather than collapsing to "the latest."
		const billsBySession = new Map<
			string,
			NonNullable<typeof billsResult.data>
		>();
		for (const bill of billsResult.data ?? []) {
			const list = billsBySession.get(bill.session_id) ?? [];
			list.push(bill);
			billsBySession.set(bill.session_id, list);
		}
		const tableLabelsBySession = new Map<string, string[]>();
		for (const table of tablesResult.data ?? []) {
			if (!table.session_id) continue;
			const labels = tableLabelsBySession.get(table.session_id) ?? [];
			labels.push(table.label);
			tableLabelsBySession.set(table.session_id, labels);
		}

		// Two maps, not one: a session with no bill row yet has every order
		// keyed only by session (nothing to attach to); once a bill exists,
		// its own round's orders are keyed by bill_id instead, so an earlier,
		// already-settled round's orders (Counter) never bleed into this one's
		// live total.
		const orders = ordersResult.data ?? [];
		const orderIdsBySession = new Map<string, string[]>();
		const orderIdsByBill = new Map<string, string[]>();
		for (const order of orders) {
			const ids = orderIdsBySession.get(order.session_id) ?? [];
			ids.push(order.id);
			orderIdsBySession.set(order.session_id, ids);
			if (order.bill_id) {
				const billIds = orderIdsByBill.get(order.bill_id) ?? [];
				billIds.push(order.id);
				orderIdsByBill.set(order.bill_id, billIds);
			}
		}

		// Only unsettled bills (and bill-less sessions) need a live total — a
		// settled bill's total is already frozen, so fetching its order_items
		// again would be wasted work.
		const unsettledBillIds = (billsResult.data ?? [])
			.filter((b) => b.status !== "settled")
			.map((b) => b.id);
		const sessionsWithNoBill = sessions.filter(
			(s) => !billsBySession.has(s.id),
		);
		const liveOrderIds = [
			...unsettledBillIds.flatMap((id) => orderIdsByBill.get(id) ?? []),
			...sessionsWithNoBill.flatMap((s) => orderIdsBySession.get(s.id) ?? []),
		];

		const itemsResult =
			liveOrderIds.length === 0
				? { data: [], error: null }
				: await ctx.auth
						.from("order_items")
						.select(
							"order_id, item_name, unit_price, tax_rate, quantity, waived_quantity, cancelled_quantity",
						)
						.eq("restaurant_id", input.restaurantId)
						.in("order_id", liveOrderIds)
						.neq("status", "cancelled");

		if (itemsResult.error)
			throw dbError("Unable to load bills.", itemsResult.error);

		const itemsByOrder = new Map<string, BillableItem[]>();
		for (const item of itemsResult.data ?? []) {
			const quantity = billableQuantity(
				item.quantity,
				item.waived_quantity,
				item.cancelled_quantity,
			);
			if (quantity <= 0) continue;
			const list = itemsByOrder.get(item.order_id) ?? [];
			list.push({
				name: item.item_name,
				unitPrice: Number(item.unit_price),
				quantity,
				taxRate: Number(item.tax_rate),
			});
			itemsByOrder.set(item.order_id, list);
		}

		type BillListRow = {
			sessionId: string;
			billId: string | null;
			billNumber: string | null;
			dailyToken: number | null;
			tableLabel: string;
			status: "open" | "requested" | "settled";
			total: number;
			date: string;
		};

		// One row per bill, across every session in scope, plus one synthetic
		// "open" row for a session that hasn't drawn a bill yet at all — each
		// round stands on its own (its own token/status/link), rather than an
		// earlier settled round vanishing once a later round starts.
		const rows = sessions.flatMap((session): BillListRow[] => {
			const tableLabel = (tableLabelsBySession.get(session.id) ?? []).join(
				", ",
			);
			const bills = billsBySession.get(session.id);

			if (!bills) {
				const items = (orderIdsBySession.get(session.id) ?? []).flatMap(
					(orderId) => itemsByOrder.get(orderId) ?? [],
				);
				return [
					{
						sessionId: session.id,
						billId: null,
						billNumber: null,
						dailyToken: null,
						tableLabel,
						status: "open" as const,
						total: liveTotal(items),
						// closed_at first, not settled_at: the date-range query above
						// bounds closed sessions by closed_at, so the displayed/sorted
						// date has to agree with it.
						date: session.closed_at ?? session.opened_at,
					},
				];
			}

			return bills.map((bill) => {
				let total: number;
				if (bill.status === "settled") {
					total = Number(bill.total ?? 0);
				} else {
					const items = (orderIdsByBill.get(bill.id) ?? []).flatMap(
						(orderId) => itemsByOrder.get(orderId) ?? [],
					);
					total = liveTotal(items);
				}

				return {
					sessionId: session.id,
					billId: bill.id,
					billNumber: bill.bill_number,
					dailyToken: bill.daily_token,
					tableLabel,
					status: bill.status as "open" | "requested" | "settled",
					total,
					date: session.closed_at ?? bill.settled_at ?? bill.created_at,
				};
			});
		});

		// Search is client-side only (bills/page.tsx), same as Table Matrix's
		// list — no server-side search param, matching tables.ts.
		return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
	}),

	// View Bill detail. Unlike guest.bill.get, this never calls
	// request_bill() as a read side effect — staff opening a row to look
	// shouldn't itself flip a bill open -> requested; that's the explicit
	// "Generate / Request Bill" action below.
	get: authedProcedure.input(getBillInput).query(async ({ ctx, input }) => {
		const sessionResult = await ctx.auth
			.from("sessions")
			.select("id, restaurant_id, status, opened_at, closed_at")
			.eq("id", input.sessionId)
			.maybeSingle();

		if (sessionResult.error)
			throw dbError("Unable to load the bill.", sessionResult.error);
		if (!sessionResult.data) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Table session not found.",
			});
		}
		const session = sessionResult.data;

		const [restaurantResult, billsResult, tablesResult, ordersResult] =
			await Promise.all([
				ctx.auth
					.from("restaurants")
					.select("name, address, city, gst_number, state, pincode")
					.eq("id", session.restaurant_id)
					.maybeSingle(),
				// Every bill the session has ever drawn, oldest first — a session
				// can carry more than one (Counter: settle, then order again).
				// Which one this call renders is resolved below: input.billId when
				// given (Bills tab links to a specific round), else the last row
				// (the current, actionable round) — every other one is
				// already-settled history (otherBills below).
				ctx.auth
					.from("bills")
					.select(
						"id, bill_number, daily_token, status, subtotal, tax_amount, total, settled_at, created_at",
					)
					.eq("session_id", session.id)
					.order("created_at", { ascending: true }),
				ctx.auth
					.from("restaurant_tables")
					.select("label")
					.eq("session_id", session.id),
				ctx.auth
					.from("orders")
					.select("id, bill_id")
					.eq("restaurant_id", session.restaurant_id)
					.eq("session_id", session.id),
			]);

		for (const result of [
			restaurantResult,
			billsResult,
			tablesResult,
			ordersResult,
		]) {
			if (result.error) throw dbError("Unable to load the bill.", result.error);
		}
		if (!restaurantResult.data) {
			throw dbError(
				"Unable to load the bill.",
				new Error("Missing restaurant"),
			);
		}

		const bills = billsResult.data ?? [];
		const bill = input.billId
			? (bills.find((b) => b.id === input.billId) ?? null)
			: (bills.at(-1) ?? null);
		if (input.billId && !bill) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
		}
		const otherBills = bill ? bills.filter((b) => b.id !== bill.id) : bills;
		// Request/Settle/Close/Force-Terminate all act on the session's current
		// round, never a past one being looked back at — the action panel below
		// only renders them here.
		const isLatestBill = !bill || bill.id === bills.at(-1)?.id;

		const orders = ordersResult.data ?? [];
		const orderIds = orders.map((o) => o.id);
		// This round's orders only, for the displayed lines/total — an earlier,
		// already-settled round's orders (Counter) must never bleed into it.
		// A session with no bill yet has every order still unattached, so all
		// of them belong to this (virtual "open") round by definition.
		const billOrderIds = bill
			? orders.filter((o) => o.bill_id === bill.id).map((o) => o.id)
			: orderIds;
		const billOrderIdSet = new Set(billOrderIds);

		const itemsResult =
			orderIds.length === 0
				? { data: [], error: null }
				: await ctx.auth
						.from("order_items")
						.select(
							"id, item_name, unit_price, tax_rate, quantity, status, waived_quantity, cancelled_quantity, order_id, spice, salt, ice, released_at",
						)
						.eq("restaurant_id", session.restaurant_id)
						.in("order_id", orderIds)
						.order("id", { ascending: true });

		if (itemsResult.error)
			throw dbError("Unable to load the bill.", itemsResult.error);

		const allItems = itemsResult.data ?? [];
		// Displayed lines/items are scoped to this round only — otherBills
		// above is where an earlier round's own items are represented (as a
		// frozen total, not a line breakdown).
		const items = allItems.filter((item) => billOrderIdSet.has(item.order_id));
		const status: "open" | "requested" | "settled" = bill?.status ?? "open";

		const billableItems = items
			.filter((item) => item.status !== "cancelled")
			.map((item) => ({
				name: item.item_name,
				unitPrice: Number(item.unit_price),
				quantity: billableQuantity(
					item.quantity,
					item.waived_quantity,
					item.cancelled_quantity,
				),
				taxRate: Number(item.tax_rate),
				spice: item.spice,
				salt: item.salt,
				ice: item.ice,
			}))
			.filter((item) => item.quantity > 0);

		// Frozen totals for a settled bill come straight from the row
		// (core-data-model.md "frozen only at settle"); only the line/tax-slab
		// breakdown — never stored on the row itself — is recomputed here,
		// safe since nothing mutates order_items after settle.
		const computed = computeBill(billableItems);
		const totals =
			status === "settled"
				? {
						lines: computed.lines,
						subtotal: Number(bill?.subtotal ?? 0),
						taxSlabs: computed.taxSlabs,
						total: Number(bill?.total ?? 0),
					}
				: computed;

		// Session-wide, not scoped to this round: Close Session (close_session())
		// requires every order item across every round terminal, not just this
		// bill's own — this gate has to agree with that.
		const hasItemsInProgress = allItems.some((item) =>
			["placed", "preparing", "ready"].includes(item.status),
		);

		return {
			sessionId: session.id,
			sessionStatus: session.status as "active" | "closed",
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
			tableLabel: (tablesResult.data ?? []).map((t) => t.label).join(", "),
			billId: bill?.id ?? null,
			billNumber: bill?.bill_number ?? null,
			dailyToken: bill?.daily_token ?? null,
			status,
			settledAt: bill?.settled_at ?? null,
			isLatestBill,
			hasItemsInProgress,
			// Every other bill this same session has drawn (Counter only, in
			// practice) — admin/staff visibility into the full visit, each one
			// independently viewable via its own billId (Bills tab links here
			// with ?bill=<id>), not just read-only totals.
			otherBills: otherBills.map((b) => ({
				billId: b.id,
				billNumber: b.bill_number,
				dailyToken: b.daily_token,
				status: b.status as "open" | "requested" | "settled",
				total: Number(b.total ?? 0),
				settledAt: b.settled_at,
			})),
			items: items.map((item) => ({
				id: item.id,
				name: item.item_name,
				unitPrice: Number(item.unit_price),
				quantity: item.quantity,
				status: item.status as
					| "placed"
					| "preparing"
					| "ready"
					| "served"
					| "cancelled",
				waivedQuantity: item.waived_quantity,
				cancelledQuantity: item.cancelled_quantity,
				spice: item.spice,
				salt: item.salt,
				ice: item.ice,
				// Correct eligible order items (docs/product.md § Bills tab):
				// only an item still in `placed` may be cancelled from here,
				// mirroring the RBAC "Cancel/Modify Order (pre-prep only)" row
				// and core-data-model.md's Order Item lifecycle
				// ("cancelled reachable only from placed").
				cancellable: item.status === "placed",
				waivable: item.status !== "cancelled",
				// Counter only: staff safety-net for a paid item the guest hasn't
				// sent to the kitchen yet (releaseOrderItem above) — the RPC
				// re-checks the bill is actually settled, this is just "is there
				// anything to release."
				releasable: item.status === "placed" && item.released_at == null,
			})),
			...totals,
		};
	}),

	// Generate / Request Bill. Staff-facing equivalent of the guest's own
	// Request Bill (guest.bill.request -> request_bill()); guests carry
	// restaurant_id/session_id as JWT claims that request_bill() reads
	// directly, but a staff session has no such claims (they can act on any
	// session in their restaurant), so this delegates to staff_request_bill()
	// (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql),
	// which takes them as explicit arguments instead — same bill-resolution
	// logic (reuse/settled-cap/daily_token draw) as request_bill(), so a
	// staff-initiated request on a Counter session gets a correctly-drawn
	// daily_token instead of a bare row, same as submitOrder's
	// staff_submit_order delegation in floor.ts.
	request: authedProcedure
		.input(requestBillInput)
		.mutation(async ({ ctx, input }) => {
			const sessionResult = await ctx.auth
				.from("sessions")
				.select("restaurant_id")
				.eq("id", input.sessionId)
				.eq("status", "active")
				.maybeSingle();

			if (sessionResult.error) {
				throw dbError("Unable to open the bill.", sessionResult.error);
			}
			if (!sessionResult.data) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Table session not found or already closed.",
				});
			}
			const restaurantId = sessionResult.data.restaurant_id;
			await requireFullServiceRole(ctx, restaurantId, BILLS_WRITE_ROLES);

			const { data, error } = await ctx.auth.rpc("staff_request_bill", {
				p_restaurant_id: restaurantId,
				p_session_id: input.sessionId,
			});
			if (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error.message,
					cause: error,
				});
			}
			return { billId: data as string };
		}),

	// Correct eligible order items, in whole or in part: cancel a mis-added
	// line — or part of its quantity — before it's started preparing.
	// `.eq("status", "placed")` makes the eligibility check atomic with the
	// write (same pattern as tables.ts's updateFreeTable) — a kitchen
	// advance racing this cancel just means zero rows match and the client
	// gets a clear "no longer eligible" error instead of cancelling an
	// in-flight dish. Reaching the full quantity also flips status to
	// 'cancelled' — irreversible from there, since that same `.eq("status",
	// "placed")` gate then rejects any further edit (same finality the old
	// whole-row-only cancel had).
	//
	// Also blocked once the item's bill is settled — see
	// assertBillNotSettled. The frontend already hides the Cancel button once
	// settled, but that's UX only; this is the server-enforced version
	// (AGENTS.md "All permissions are server-enforced").
	cancelOrderItem: authedProcedure
		.input(cancelOrderItemInput)
		.mutation(async ({ ctx, input }) => {
			const itemResult = await ctx.auth
				.from("order_items")
				.select("order_id, restaurant_id, quantity, waived_quantity")
				.eq("id", input.orderItemId)
				.maybeSingle();
			if (itemResult.error)
				throw dbError("Unable to cancel the item.", itemResult.error);
			if (!itemResult.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Order item not found.",
				});
			}
			await requireFullServiceRole(
				ctx,
				itemResult.data.restaurant_id,
				BILLS_WRITE_ROLES,
			);
			assertWithinRemaining(
				"cancel",
				input.cancelledQuantity,
				itemResult.data.quantity,
				itemResult.data.waived_quantity,
			);

			await assertBillNotSettled(
				ctx.auth,
				itemResult.data.order_id,
				"Unable to cancel the item.",
			);

			const fullyCancelled =
				input.cancelledQuantity === itemResult.data.quantity;

			const { data, error } = await ctx.auth
				.from("order_items")
				.update({
					cancelled_quantity: input.cancelledQuantity,
					...(fullyCancelled ? { status: "cancelled" as const } : {}),
					updated_at: new Date().toISOString(),
				})
				.eq("id", input.orderItemId)
				.eq("status", "placed")
				.select("id")
				.maybeSingle();

			if (error) throw dbError("Unable to cancel the item.", error);
			if (!data) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This item has already started preparing and can no longer be corrected.",
				});
			}
			return { id: data.id, cancelledQuantity: input.cancelledQuantity };
		}),

	// Counter only (bills/[sessionId]/page.tsx's inline quantity pill): unlike
	// cancelOrderItem/waiveOrderItem, which record a correction against the
	// originally ordered quantity, this replaces `quantity` outright — nothing
	// has reached the kitchen yet (still 'placed'), so there's no "originally
	// ordered" figure worth preserving. Clears any prior waive/cancel
	// bookkeeping so the item's displayed quantity stays the single source of
	// truth. 0 maps onto a full cancel instead of violating
	// order_items_quantity_check (quantity must stay > 0).
	setOrderItemQuantity: authedProcedure
		.input(setOrderItemQuantityInput)
		.mutation(async ({ ctx, input }) => {
			const itemResult = await ctx.auth
				.from("order_items")
				.select("order_id, restaurant_id, quantity")
				.eq("id", input.orderItemId)
				.maybeSingle();
			if (itemResult.error)
				throw dbError("Unable to update the item.", itemResult.error);
			if (!itemResult.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Order item not found.",
				});
			}
			await requireFullServiceRole(
				ctx,
				itemResult.data.restaurant_id,
				BILLS_WRITE_ROLES,
			);
			await assertBillNotSettled(
				ctx.auth,
				itemResult.data.order_id,
				"Unable to update the item.",
			);

			const { data, error } = await ctx.auth
				.from("order_items")
				.update(
					input.quantity === 0
						? {
								cancelled_quantity: itemResult.data.quantity,
								waived_quantity: 0,
								status: "cancelled" as const,
								updated_at: new Date().toISOString(),
							}
						: {
								quantity: input.quantity,
								cancelled_quantity: 0,
								waived_quantity: 0,
								updated_at: new Date().toISOString(),
							},
				)
				.eq("id", input.orderItemId)
				.eq("status", "placed")
				.select("id")
				.maybeSingle();

			if (error) throw dbError("Unable to update the item.", error);
			if (!data) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This item has already started preparing and can no longer be corrected.",
				});
			}
			return { id: data.id, quantity: input.quantity };
		}),

	// Waive an order item, in whole or in part: excludes waivedQuantity of it
	// from bill math without touching status/quantity, for exceptional cases
	// a cancel doesn't fit — a quality complaint on an already-served dish,
	// or a short-served quantity (e.g. 3 ordered, only 2 came out). Adjustable
	// until the bill settles. Unlike cancelOrderItem, not gated to
	// `status = 'placed'` — the whole point is covering items past that
	// point, so any non-cancelled item is eligible.
	waiveOrderItem: authedProcedure
		.input(waiveOrderItemInput)
		.mutation(async ({ ctx, input }) => {
			const itemResult = await ctx.auth
				.from("order_items")
				.select("order_id, restaurant_id, status, quantity, cancelled_quantity")
				.eq("id", input.orderItemId)
				.maybeSingle();
			if (itemResult.error)
				throw dbError("Unable to update the item.", itemResult.error);
			if (!itemResult.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Order item not found.",
				});
			}
			await requireFullServiceRole(
				ctx,
				itemResult.data.restaurant_id,
				BILLS_WRITE_ROLES,
			);
			if (itemResult.data.status === "cancelled") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This item is cancelled and isn't part of the bill.",
				});
			}
			assertWithinRemaining(
				"waive",
				input.waivedQuantity,
				itemResult.data.quantity,
				itemResult.data.cancelled_quantity,
			);

			await assertBillNotSettled(
				ctx.auth,
				itemResult.data.order_id,
				"Unable to update the item.",
			);

			const { data, error } = await ctx.auth
				.from("order_items")
				.update({
					waived_quantity: input.waivedQuantity,
					updated_at: new Date().toISOString(),
				})
				.eq("id", input.orderItemId)
				.neq("status", "cancelled")
				.select("id")
				.maybeSingle();
			if (error) throw dbError("Unable to update the item.", error);
			if (!data) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This item is cancelled and isn't part of the bill.",
				});
			}
			return { id: data.id, waivedQuantity: input.waivedQuantity };
		}),

	// Counter only: staff-side safety net for the guest's own per-item
	// release (guest.orders.release -> release_order_item_to_kitchen()) — a
	// guest can lose access to a paid round they haven't finished sending to
	// the kitchen (lost phone, dropped cookie), and there is no other path
	// back to that RPC, which only ever checks the caller's own guest JWT.
	// Same role list as every other Bills tab write; the RPC itself re-checks
	// the settled-bill gate server-side.
	releaseOrderItem: authedProcedure
		.input(releaseOrderItemInput)
		.mutation(async ({ ctx, input }) => {
			const itemsResult = await ctx.auth
				.from("order_items")
				.select("id, restaurant_id")
				.in("id", input.orderItemIds);
			if (itemsResult.error) {
				throw dbError(
					"Unable to send the item to the kitchen.",
					itemsResult.error,
				);
			}
			const items = itemsResult.data ?? [];
			if (items.length !== input.orderItemIds.length) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Order item not found.",
				});
			}
			// Every id a merged line combines always shares one restaurant (they
			// share a dish + a bill), but staff role is still checked once
			// against it rather than assumed.
			const restaurantId = items[0]?.restaurant_id;
			if (
				!restaurantId ||
				items.some((i) => i.restaurant_id !== restaurantId)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "These items don't belong to the same restaurant.",
				});
			}
			const experience = await requireFullServiceRole(
				ctx,
				restaurantId,
				BILLS_WRITE_ROLES,
			);
			// Counter only — this is the safety net for release_order_item_to_
			// kitchen(), which only ever matters on Counter's paid-then-release
			// flow. Setting released_at on a One/Guest item would be inert (never
			// read there), but there's no legitimate reason to reach it.
			if (experience !== "counter") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This isn't available for this restaurant's experience.",
				});
			}

			// Concurrent, not sequential — the RPC re-validates each row on its
			// own (bill settled), so one failing id must not block the others in
			// the same merged line from still going through.
			const results = await Promise.allSettled(
				items.map((item) =>
					ctx.auth.rpc("staff_release_order_item_to_kitchen", {
						p_restaurant_id: restaurantId,
						p_order_item_id: item.id,
					}),
				),
			);
			const failure = results.find(
				(result) => result.status === "rejected" || result.value.error,
			);
			if (failure) {
				const error =
					failure.status === "rejected" ? failure.reason : failure.value.error;
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error?.message ?? "Unable to send the item to the kitchen.",
					cause: error,
				});
			}
		}),

	// Mark Bill Settled. Computes and freezes subtotal/tax/service/total from
	// the session's non-cancelled order_items (core-data-model.md "compute
	// and store ... at settlement") using the same bill-math.ts the guest
	// screen reads live — settle isn't a different formula, just the last
	// time it's ever run for this bill. `.neq("status", "settled")` makes
	// the freeze atomic against a double-tap. Requires an existing bill row
	// (i.e. Request Bill has already run) — the status ladder is always
	// Open -> Requested -> Settled, never a direct Open -> Settled skip, so
	// there's nothing to freeze if the bill was never requested.
	settle: authedProcedure
		.input(settleBillInput)
		.mutation(async ({ ctx, input }) => {
			const sessionResult = await ctx.auth
				.from("sessions")
				.select("restaurant_id")
				.eq("id", input.sessionId)
				.maybeSingle();
			if (sessionResult.error)
				throw dbError("Unable to settle the bill.", sessionResult.error);
			if (!sessionResult.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Table session not found.",
				});
			}
			const restaurantId = sessionResult.data.restaurant_id;
			await requireFullServiceRole(ctx, restaurantId, BILLS_WRITE_ROLES);

			// Only the session's current round: `.limit(1)` on the latest row,
			// same reasoning as bills.request above — a session can carry more
			// than one bill (Counter), and settling only ever means settling the
			// one that's still open.
			const [billResult, userResult] = await Promise.all([
				ctx.auth
					.from("bills")
					.select("id, status")
					.eq("session_id", input.sessionId)
					.order("created_at", { ascending: false })
					.limit(1)
					.maybeSingle(),
				ctx.auth.auth.getUser(),
			]);
			if (billResult.error)
				throw dbError("Unable to settle the bill.", billResult.error);
			if (billResult.data?.status === "settled") {
				return { billId: billResult.data.id };
			}
			if (!billResult.data) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Request the bill before settling it.",
				});
			}

			// This round's orders only — an earlier, already-settled round's
			// items must never be re-summed into this bill's total.
			const ordersResult = await ctx.auth
				.from("orders")
				.select("id")
				.eq("restaurant_id", restaurantId)
				.eq("bill_id", billResult.data.id);
			if (ordersResult.error)
				throw dbError("Unable to settle the bill.", ordersResult.error);

			// settled_by: the caller's own Staff row for this restaurant, if they
			// have one — Dineinly Admin settling on a restaurant's behalf has no
			// Staff row at all, so this stays null for that case (the FK is
			// nullable, on delete set null, same as orders.placed_by_staff_id).
			let settledBy: string | null = null;
			const userId = userResult.data.user?.id;
			if (userId) {
				const staffResult = await ctx.auth
					.from("staff")
					.select("id")
					.eq("restaurant_id", restaurantId)
					.eq("user_id", userId)
					.eq("status", "active")
					.maybeSingle();
				if (staffResult.error)
					throw dbError("Unable to settle the bill.", staffResult.error);
				settledBy = staffResult.data?.id ?? null;
			}

			const orderIds = (ordersResult.data ?? []).map((o) => o.id);
			const itemsResult =
				orderIds.length === 0
					? { data: [], error: null }
					: await ctx.auth
							.from("order_items")
							.select(
								"item_name, unit_price, tax_rate, quantity, waived_quantity, cancelled_quantity",
							)
							.eq("restaurant_id", restaurantId)
							.in("order_id", orderIds)
							.neq("status", "cancelled");
			if (itemsResult.error)
				throw dbError("Unable to settle the bill.", itemsResult.error);

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
					}))
					.filter((row) => row.quantity > 0),
			);
			const taxAmount = totals.taxSlabs.reduce(
				(sum, slab) => sum + slab.cgst + slab.sgst,
				0,
			);

			const settledFields = {
				status: "settled" as const,
				subtotal: totals.subtotal,
				tax_amount: taxAmount,
				total: totals.total,
				settled_at: new Date().toISOString(),
				settled_by: settledBy,
			};

			// .maybeSingle(), not .single(): a concurrent settle can win the
			// `.neq("status", "settled")` race between our read above and this
			// write, leaving 0 rows matched — already settled by the other
			// caller, so still an idempotent success, not an error.
			const { data, error } = await ctx.auth
				.from("bills")
				.update(settledFields)
				.eq("id", billResult.data.id)
				.neq("status", "settled")
				.select("id")
				.maybeSingle();
			if (error) throw dbError("Unable to settle the bill.", error);
			return { billId: data?.id ?? billResult.data.id };
		}),

	// Close Session (Full-Service only, docs/product.md § Bills tab): delegates
	// to close_session() (supabase/migrations/
	// 20260730150634_add_auth_fk_and_rls_policies.sql § 14) — three tables
	// (sessions, restaurant_tables, cart_items) in one transaction, so this
	// can't be a plain ctx.auth.update() the way settle/waive are. The role
	// check and the "every bill settled, nothing in progress" gate both live
	// inside the RPC itself, not here.
	closeSession: authedProcedure
		.input(closeSessionInput)
		.mutation(async ({ ctx, input }) => {
			const { error } = await ctx.auth.rpc("close_session", {
				p_session_id: input.sessionId,
			});
			if (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error.message,
					cause: error,
				});
			}
			return { closed: true };
		}),

	// Force-Terminate Session (walkout): delegates to force_terminate_session()
	// (§ 14 of the RLS migration) — ends the session and voids (deletes) an
	// unsettled bill regardless of what's in progress, since it exists
	// precisely to override those for an abandoned table.
	forceTerminate: authedProcedure
		.input(forceTerminateSessionInput)
		.mutation(async ({ ctx, input }) => {
			const { error } = await ctx.auth.rpc("force_terminate_session", {
				p_session_id: input.sessionId,
			});
			if (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error.message,
					cause: error,
				});
			}
			return { closed: true };
		}),

	// Print / Download Bill. Print is the browser's own window.print() on
	// the same detail page (no server round trip); this is only the
	// Download side, rendered fully server-side like the Table Matrix's QR
	// PDFs (docs/architecture.md § Table QR Generation) for output that's
	// consistent regardless of the staff member's browser.
	downloadPdf: authedProcedure
		.input(downloadBillPdfInput)
		.query(async ({ ctx, input }) => {
			const sessionResult = await ctx.auth
				.from("sessions")
				.select("restaurant_id")
				.eq("id", input.sessionId)
				.maybeSingle();
			if (sessionResult.error) {
				throw dbError("Unable to build the bill.", sessionResult.error);
			}
			if (!sessionResult.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Table session not found.",
				});
			}

			// input.billId when given (Bills tab downloading a specific past
			// round), else the latest — same resolution as bills.get.
			const billQuery = input.billId
				? ctx.auth
						.from("bills")
						.select("id, bill_number, status, subtotal, tax_amount, total")
						.eq("id", input.billId)
						.eq("session_id", input.sessionId)
						.maybeSingle()
				: ctx.auth
						.from("bills")
						.select("id, bill_number, status, subtotal, tax_amount, total")
						.eq("session_id", input.sessionId)
						.order("created_at", { ascending: false })
						.limit(1)
						.maybeSingle();

			const [restaurantResult, billResult, tablesResult] = await Promise.all([
				ctx.auth
					.from("restaurants")
					.select("name, address, city, gst_number, state, pincode")
					.eq("id", sessionResult.data.restaurant_id)
					.maybeSingle(),
				billQuery,
				ctx.auth
					.from("restaurant_tables")
					.select("label")
					.eq("session_id", input.sessionId),
			]);
			for (const result of [restaurantResult, billResult, tablesResult]) {
				if (result.error)
					throw dbError("Unable to build the bill.", result.error);
			}
			if (!restaurantResult.data) {
				throw dbError(
					"Unable to build the bill.",
					new Error("Missing restaurant"),
				);
			}
			if (input.billId && !billResult.data) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found." });
			}

			const bill = billResult.data;
			// This round's orders only — a session with no bill yet (nothing to
			// scope by) falls back to every order it has, same as bills.get.
			const ordersResult = await ctx.auth
				.from("orders")
				.select("id")
				.eq("restaurant_id", sessionResult.data.restaurant_id)
				.eq(bill ? "bill_id" : "session_id", bill ? bill.id : input.sessionId);
			if (ordersResult.error)
				throw dbError("Unable to build the bill.", ordersResult.error);

			const orderIds = (ordersResult.data ?? []).map((o) => o.id);
			const itemsResult =
				orderIds.length === 0
					? { data: [], error: null }
					: await ctx.auth
							.from("order_items")
							.select(
								"item_name, unit_price, tax_rate, quantity, waived_quantity, cancelled_quantity, spice, salt, ice",
							)
							.eq("restaurant_id", sessionResult.data.restaurant_id)
							.in("order_id", orderIds)
							.neq("status", "cancelled");
			if (itemsResult.error)
				throw dbError("Unable to build the bill.", itemsResult.error);

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
			// Frozen totals for a settled bill come straight from the row, same
			// as bills.get — only the line/tax-slab breakdown (never stored on
			// the row) is recomputed, safe since order_items don't change after
			// settle.
			const totals =
				bill?.status === "settled"
					? {
							lines: computed.lines,
							subtotal: Number(bill.subtotal ?? 0),
							taxSlabs: computed.taxSlabs,
							total: Number(bill.total ?? 0),
						}
					: computed;

			const pdf = await buildBillPdf({
				// Same "Bill only exists on One/Counter" invariant as bills.get above.
				restaurant: {
					name: restaurantResult.data.name,
					address: restaurantResult.data.address as string,
					city: restaurantResult.data.city as string,
					gst_number: restaurantResult.data.gst_number as string,
					state: restaurantResult.data.state as string,
					pincode: restaurantResult.data.pincode as string,
				},
				billNumber: bill?.bill_number ?? null,
				tableLabel: (tablesResult.data ?? []).map((t) => t.label).join(", "),
				totals,
			});

			return {
				fileName: `bill-${bill?.bill_number ?? "draft"}.pdf`,
				base64: Buffer.from(pdf).toString("base64"),
			};
		}),
});
