import { TRPCError } from "@trpc/server";
import type { StaffRole } from "@/lib/auth";
import { billableQuantity, computeBill, ratePercent } from "@/lib/bill-math";
import { buildBillPdf } from "@/lib/bill-pdf";
import type { Context } from "../trpc/context";
import { dbError } from "../trpc/errors";
import { authedProcedure, router } from "../trpc/init";
import { requireStaffRole } from "../trpc/rbac";
import {
	cancelOrderItemInput,
	closeSessionInput,
	downloadBillPdfInput,
	forceTerminateSessionInput,
	getBillInput,
	listBillsInput,
	requestBillInput,
	settleBillInput,
	waiveOrderItemInput,
	waiveServiceChargeInput,
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
function liveTotal(items: BillableItem[], serviceChargeRate: number): number {
	return computeBill(items, serviceChargeRate).total;
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
		.select("session_id")
		.eq("id", orderId)
		.maybeSingle();
	if (orderResult.error) throw dbError(errorMessage, orderResult.error);
	if (!orderResult.data) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
	}

	const billResult = await auth
		.from("bills")
		.select("status")
		.eq("session_id", orderResult.data.session_id)
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
// staff_all_table_sessions/staff_all_bills/staff_all_cart_items RLS
// (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 5)
// scope every query below to the caller's own restaurant. Every write is
// Waiter/Manager/Owner only (Request/Settle/Close/Force-Terminate/correct —
// docs/product.md § RBAC all exclude Kitchen), enforced via requireStaffRole
// below; closeSession's is inside close_session() itself (§ 14 of that
// migration) since it's a SECURITY INVOKER RPC, not a plain ctx.auth write.
export const billsRouter = router({
	// Bills tab list (docs/product.md § Billing & Settlement): one row per
	// table session, not per bill row — a session that's never had "Request
	// Bill" pressed has no bills row at all yet (request_bill() only ever
	// inserts one already `requested`), so its status is the derived virtual
	// state "open". Every currently active session is always included
	// (today's business, regardless of the date filter); the date filter
	// only bounds the *closed* history so past days don't grow unbounded.
	list: authedProcedure.input(listBillsInput).query(async ({ ctx, input }) => {
		const range = dateRangeFor(input.date);

		const closedQuery = ctx.auth
			.from("table_sessions")
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
					.from("table_sessions")
					.select("id, restaurant_id, status, opened_at, closed_at")
					.eq("restaurant_id", input.restaurantId)
					.eq("status", "active");

		const [activeResult, closedResult, restaurantResult] = await Promise.all([
			activeQuery,
			closedQuery,
			ctx.auth
				.from("restaurants")
				.select("service_charge_rate")
				.eq("id", input.restaurantId)
				.maybeSingle(),
		]);

		for (const result of [activeResult, closedResult, restaurantResult]) {
			if (result.error) throw dbError("Unable to load bills.", result.error);
		}

		const sessions = [
			...(activeResult.data ?? []),
			...(closedResult.data ?? []),
		];
		if (sessions.length === 0) return [];

		const sessionIds = sessions.map((s) => s.id);
		const restaurantServiceChargeRate = Number(
			restaurantResult.data?.service_charge_rate ?? 0,
		);

		const [billsResult, tablesResult, ordersResult] = await Promise.all([
			ctx.auth
				.from("bills")
				.select(
					"id, session_id, bill_number, status, service_charge_rate, service_charge_waived, total, settled_at",
				)
				.eq("restaurant_id", input.restaurantId)
				.in("session_id", sessionIds),
			ctx.auth
				.from("restaurant_tables")
				.select("session_id, label")
				.eq("restaurant_id", input.restaurantId)
				.in("session_id", sessionIds),
			ctx.auth
				.from("orders")
				.select("id, session_id")
				.eq("restaurant_id", input.restaurantId)
				.in("session_id", sessionIds),
		]);

		for (const result of [billsResult, tablesResult, ordersResult]) {
			if (result.error) throw dbError("Unable to load bills.", result.error);
		}

		const billsBySession = new Map(
			(billsResult.data ?? []).map((b) => [b.session_id, b]),
		);
		const tableLabelsBySession = new Map<string, string[]>();
		for (const table of tablesResult.data ?? []) {
			if (!table.session_id) continue;
			const labels = tableLabelsBySession.get(table.session_id) ?? [];
			labels.push(table.label);
			tableLabelsBySession.set(table.session_id, labels);
		}

		const orders = ordersResult.data ?? [];
		const orderIdsBySession = new Map<string, string[]>();
		for (const order of orders) {
			const ids = orderIdsBySession.get(order.session_id) ?? [];
			ids.push(order.id);
			orderIdsBySession.set(order.session_id, ids);
		}

		// Only unsettled sessions need a live total — a settled bill's total
		// is already frozen, so fetching its order_items again would be
		// wasted work.
		const liveOrderIds = sessions
			.filter((s) => billsBySession.get(s.id)?.status !== "settled")
			.flatMap((s) => orderIdsBySession.get(s.id) ?? []);

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

		const rows = sessions.map((session) => {
			const bill = billsBySession.get(session.id);
			const tableLabel = (tableLabelsBySession.get(session.id) ?? []).join(
				", ",
			);
			const status: "open" | "requested" | "settled" = bill?.status ?? "open";

			let total: number;
			if (status === "settled") {
				total = Number(bill?.total ?? 0);
			} else {
				const items = (orderIdsBySession.get(session.id) ?? []).flatMap(
					(orderId) => itemsByOrder.get(orderId) ?? [],
				);
				const rate = bill?.service_charge_waived
					? 0
					: Number(bill?.service_charge_rate ?? restaurantServiceChargeRate);
				total = liveTotal(items, rate);
			}

			return {
				sessionId: session.id,
				billId: bill?.id ?? null,
				billNumber: bill?.bill_number ?? null,
				tableLabel,
				status,
				total,
				// closed_at first, not settled_at: the date-range query above
				// bounds closed sessions by closed_at, so the displayed/sorted
				// date has to agree with it — a bill settled just before
				// midnight but closed just after would otherwise show under
				// "Today" with yesterday's timestamp.
				date: session.closed_at ?? bill?.settled_at ?? session.opened_at,
			};
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
			.from("table_sessions")
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

		const [restaurantResult, billResult, tablesResult, ordersResult] =
			await Promise.all([
				ctx.auth
					.from("restaurants")
					.select(
						"name, address, city, gst_number, state, pincode, service_charge_rate",
					)
					.eq("id", session.restaurant_id)
					.maybeSingle(),
				ctx.auth
					.from("bills")
					.select(
						"id, bill_number, status, service_charge_rate, service_charge_waived, subtotal, tax_amount, service_charge_amount, total, settled_at",
					)
					.eq("session_id", session.id)
					.maybeSingle(),
				ctx.auth
					.from("restaurant_tables")
					.select("label")
					.eq("session_id", session.id),
				ctx.auth
					.from("orders")
					.select("id")
					.eq("restaurant_id", session.restaurant_id)
					.eq("session_id", session.id),
			]);

		for (const result of [
			restaurantResult,
			billResult,
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

		const orderIds = (ordersResult.data ?? []).map((o) => o.id);
		const itemsResult =
			orderIds.length === 0
				? { data: [], error: null }
				: await ctx.auth
						.from("order_items")
						.select(
							"id, item_name, unit_price, tax_rate, quantity, status, waived_quantity, cancelled_quantity, order_id",
						)
						.eq("restaurant_id", session.restaurant_id)
						.in("order_id", orderIds)
						.order("id", { ascending: true });

		if (itemsResult.error)
			throw dbError("Unable to load the bill.", itemsResult.error);

		const allItems = itemsResult.data ?? [];
		const bill = billResult.data;
		const status: "open" | "requested" | "settled" = bill?.status ?? "open";
		const waived = bill?.service_charge_waived ?? false;

		const billableItems: BillableItem[] = allItems
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
			}))
			.filter((item) => item.quantity > 0);

		const serviceChargeRate = waived
			? 0
			: Number(
					bill?.service_charge_rate ??
						restaurantResult.data.service_charge_rate ??
						0,
				);

		// Frozen totals for a settled bill come straight from the row
		// (core-data-model.md "frozen only at settle"); only the line/tax-slab
		// breakdown — never stored on the row itself — is recomputed here,
		// safe since nothing mutates order_items after settle.
		const computed = computeBill(billableItems, serviceChargeRate);
		const totals =
			status === "settled"
				? {
						lines: computed.lines,
						subtotal: Number(bill?.subtotal ?? 0),
						taxSlabs: computed.taxSlabs,
						serviceCharge: Number(bill?.service_charge_amount ?? 0),
						total: Number(bill?.total ?? 0),
					}
				: computed;

		const hasItemsInProgress = allItems.some((item) =>
			["placed", "preparing", "ready"].includes(item.status),
		);

		return {
			sessionId: session.id,
			sessionStatus: session.status as "active" | "closed",
			restaurant: {
				name: restaurantResult.data.name,
				address: restaurantResult.data.address,
				city: restaurantResult.data.city,
				gstNumber: restaurantResult.data.gst_number,
				state: restaurantResult.data.state,
				pincode: restaurantResult.data.pincode,
			},
			tableLabel: (tablesResult.data ?? []).map((t) => t.label).join(", "),
			billId: bill?.id ?? null,
			billNumber: bill?.bill_number ?? null,
			status,
			serviceChargeWaived: waived,
			serviceChargeRatePercent: ratePercent(serviceChargeRate),
			settledAt: bill?.settled_at ?? null,
			hasItemsInProgress,
			items: allItems.map((item) => ({
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
				// Correct eligible order items (docs/product.md § Bills tab):
				// only an item still in `placed` may be cancelled from here,
				// mirroring the RBAC "Cancel/Modify Order (pre-prep only)" row
				// and core-data-model.md's Order Item lifecycle
				// ("cancelled reachable only from placed").
				cancellable: item.status === "placed",
				waivable: item.status !== "cancelled",
			})),
			...totals,
		};
	}),

	// Generate / Request Bill. Staff-facing equivalent of the guest's own
	// Request Bill (guest.bill.request -> request_bill()); guests carry
	// restaurant_id/table_session_id as JWT claims that request_bill() reads
	// directly, but a staff session has no such claims (they can act on any
	// session in their restaurant), so this mirrors that function's logic
	// with an explicit sessionId instead of calling it. Two round trips, not
	// one transaction: a single-staff, low-stakes action, same trade-off as
	// tables.ts's regenerateQr (architecture.md § Table QR Generation
	// "single-admin, low-stakes action with no data corruption possible").
	request: authedProcedure
		.input(requestBillInput)
		.mutation(async ({ ctx, input }) => {
			const sessionResult = await ctx.auth
				.from("table_sessions")
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
			await requireStaffRole(ctx, restaurantId, BILLS_WRITE_ROLES);

			const existing = await ctx.auth
				.from("bills")
				.select("id, status, service_charge_waived")
				.eq("session_id", input.sessionId)
				.maybeSingle();
			if (existing.error)
				throw dbError("Unable to open the bill.", existing.error);

			// Already settled: frozen, nothing to do — same idempotent no-op
			// request_bill() applies once a bill reaches that state.
			if (existing.data?.status === "settled") {
				return { billId: existing.data.id };
			}

			const restaurantResult = await ctx.auth
				.from("restaurants")
				.select("service_charge_rate")
				.eq("id", restaurantId)
				.maybeSingle();
			if (restaurantResult.error) {
				throw dbError("Unable to open the bill.", restaurantResult.error);
			}

			if (existing.data) {
				const { data, error } = await ctx.auth
					.from("bills")
					.update({
						status: "requested",
						service_charge_rate: existing.data.service_charge_waived
							? 0
							: (restaurantResult.data?.service_charge_rate ?? null),
					})
					.eq("id", existing.data.id)
					.select("id")
					.single();
				if (error) throw dbError("Unable to open the bill.", error);
				return { billId: data.id };
			}

			const { data, error } = await ctx.auth
				.from("bills")
				.insert({
					restaurant_id: restaurantId,
					session_id: input.sessionId,
					status: "requested",
					service_charge_rate:
						restaurantResult.data?.service_charge_rate ?? null,
				})
				.select("id")
				.single();
			if (error) throw dbError("Unable to open the bill.", error);
			return { billId: data.id };
		}),

	// Waive Service Charge. Only while the bill isn't settled — settle
	// freezes serviceChargeAmount, so a waiver after that point would have
	// nothing left to affect (core-data-model.md "frozen only at settle").
	// Requires an existing bill row (i.e. Request Bill has already run):
	// bills.bill_number draws unconditionally from bill_number_seq on any
	// insert, so a get-or-create insert here would hand out a bill number
	// while the row still reads "open" — contradicting product.md § Bills
	// tab's "shown as Open with no bill number yet".
	waiveServiceCharge: authedProcedure
		.input(waiveServiceChargeInput)
		.mutation(async ({ ctx, input }) => {
			const sessionResult = await ctx.auth
				.from("table_sessions")
				.select("restaurant_id")
				.eq("id", input.sessionId)
				.maybeSingle();
			if (sessionResult.error) {
				throw dbError(
					"Unable to update the service charge.",
					sessionResult.error,
				);
			}
			if (!sessionResult.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Table session not found.",
				});
			}
			await requireStaffRole(
				ctx,
				sessionResult.data.restaurant_id,
				BILLS_WRITE_ROLES,
			);

			const [existing, restaurantResult] = await Promise.all([
				ctx.auth
					.from("bills")
					.select("id, status")
					.eq("session_id", input.sessionId)
					.maybeSingle(),
				ctx.auth
					.from("restaurants")
					.select("service_charge_rate")
					.eq("id", sessionResult.data.restaurant_id)
					.maybeSingle(),
			]);
			if (existing.error) {
				throw dbError("Unable to update the service charge.", existing.error);
			}
			if (restaurantResult.error) {
				throw dbError(
					"Unable to update the service charge.",
					restaurantResult.error,
				);
			}
			if (existing.data?.status === "settled") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This bill is already settled.",
				});
			}

			const serviceChargeRate = input.waived
				? 0
				: (restaurantResult.data?.service_charge_rate ?? null);

			if (!existing.data) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Request the bill before waiving the service charge.",
				});
			}

			const { error } = await ctx.auth
				.from("bills")
				.update({
					service_charge_waived: input.waived,
					service_charge_rate: serviceChargeRate,
				})
				.eq("id", existing.data.id)
				.neq("status", "settled");
			if (error) throw dbError("Unable to update the service charge.", error);
			return { waived: input.waived };
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
			await requireStaffRole(
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

	// Waive an order item, in whole or in part: excludes waivedQuantity of it
	// from bill math without touching status/quantity, for exceptional cases
	// a cancel doesn't fit — a quality complaint on an already-served dish,
	// or a short-served quantity (e.g. 3 ordered, only 2 came out). Mirrors
	// waiveServiceCharge: adjustable until the bill settles. Unlike
	// cancelOrderItem, not gated to `status = 'placed'` — the whole point is
	// covering items past that point, so any non-cancelled item is eligible.
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
			await requireStaffRole(
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
				.update({ waived_quantity: input.waivedQuantity })
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
				.from("table_sessions")
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
			await requireStaffRole(ctx, restaurantId, BILLS_WRITE_ROLES);

			const [billResult, ordersResult, userResult] = await Promise.all([
				ctx.auth
					.from("bills")
					.select("id, service_charge_rate, service_charge_waived, status")
					.eq("session_id", input.sessionId)
					.maybeSingle(),
				ctx.auth
					.from("orders")
					.select("id")
					.eq("restaurant_id", restaurantId)
					.eq("session_id", input.sessionId),
				ctx.auth.auth.getUser(),
			]);
			if (billResult.error)
				throw dbError("Unable to settle the bill.", billResult.error);
			if (ordersResult.error)
				throw dbError("Unable to settle the bill.", ordersResult.error);
			if (billResult.data?.status === "settled") {
				return { billId: billResult.data.id };
			}
			if (!billResult.data) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Request the bill before settling it.",
				});
			}

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

			const serviceChargeRate = billResult.data.service_charge_waived
				? 0
				: Number(billResult.data.service_charge_rate ?? 0);

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
				serviceChargeRate,
			);
			const taxAmount = totals.taxSlabs.reduce(
				(sum, slab) => sum + slab.cgst + slab.sgst,
				0,
			);

			const settledFields = {
				status: "settled" as const,
				service_charge_rate: serviceChargeRate,
				subtotal: totals.subtotal,
				tax_amount: taxAmount,
				service_charge_amount: totals.serviceCharge,
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

	// Close Session: delegates to close_session() (supabase/migrations/
	// 20260730150634_add_auth_fk_and_rls_policies.sql § 14) — three tables
	// (table_sessions, restaurant_tables, cart_items) in one transaction, so
	// this can't be a plain ctx.auth.update() the way settle/waive are.
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
	// (§ 14 of the RLS migration) — same shape as closeSession, but voids
	// (deletes) an unsettled bill and skips every gate Close Session enforces
	// (bill settled, nothing in progress), since it exists precisely to
	// override those for an abandoned table.
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
				.from("table_sessions")
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

			const [restaurantResult, billResult, tablesResult, ordersResult] =
				await Promise.all([
					ctx.auth
						.from("restaurants")
						.select(
							"name, address, city, gst_number, state, pincode, service_charge_rate",
						)
						.eq("id", sessionResult.data.restaurant_id)
						.maybeSingle(),
					ctx.auth
						.from("bills")
						.select(
							"bill_number, status, service_charge_rate, service_charge_waived, subtotal, tax_amount, service_charge_amount, total",
						)
						.eq("session_id", input.sessionId)
						.maybeSingle(),
					ctx.auth
						.from("restaurant_tables")
						.select("label")
						.eq("session_id", input.sessionId),
					ctx.auth
						.from("orders")
						.select("id")
						.eq("restaurant_id", sessionResult.data.restaurant_id)
						.eq("session_id", input.sessionId),
				]);
			for (const result of [
				restaurantResult,
				billResult,
				tablesResult,
				ordersResult,
			]) {
				if (result.error)
					throw dbError("Unable to build the bill.", result.error);
			}
			if (!restaurantResult.data) {
				throw dbError(
					"Unable to build the bill.",
					new Error("Missing restaurant"),
				);
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
							.eq("restaurant_id", sessionResult.data.restaurant_id)
							.in("order_id", orderIds)
							.neq("status", "cancelled");
			if (itemsResult.error)
				throw dbError("Unable to build the bill.", itemsResult.error);

			const bill = billResult.data;
			const waived = bill?.service_charge_waived ?? false;
			const serviceChargeRate = waived
				? 0
				: Number(
						bill?.service_charge_rate ??
							restaurantResult.data.service_charge_rate ??
							0,
					);
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
					}))
					.filter((row) => row.quantity > 0),
				serviceChargeRate,
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
							serviceCharge: Number(bill.service_charge_amount ?? 0),
							total: Number(bill.total ?? 0),
						}
					: computed;

			const pdf = await buildBillPdf({
				restaurant: restaurantResult.data,
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
