import { TRPCError } from "@trpc/server";
import type { Database } from "@workspace/db";
import { z } from "zod";
import type { StaffRole } from "@/lib/auth";
import type { Context } from "../trpc/context";
import { dbError } from "../trpc/errors";
import { authedProcedure, router } from "../trpc/init";
import {
	assertFullServiceExperience,
	requireFullServiceRole,
	requireStaffRole,
} from "../trpc/rbac";

const restaurantIdSchema = z.string().uuid();

// Kitchen only ever moves an item forward one step — never cancels
// (docs/core-data-model.md "Order Item status lifecycle invariants").
const ADVANCE_FROM: Record<"preparing" | "ready", "placed" | "preparing"> = {
	preparing: "placed",
	ready: "preparing",
};

// "View Kitchen Queue" (docs/product.md § RBAC) is any active staff member —
// listQueue/listAvailability stay open to all. "Update Order Status" is
// Kitchen/Manager/Owner only; advanceBatch enforces that split below.
function assertNoQueueError(error: unknown): void {
	if (!error) return;
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "Unable to load the kitchen queue.",
		cause: error,
	});
}

type OrderItemStatus = "placed" | "preparing" | "ready" | "served";

// Counter-experience gate (docs/core-data-model.md § Lifecycle invariants):
// placed -> preparing additionally requires the session's Bill to be settled
// AND the guest to have released this item to the kitchen (order-items.
// released_at, set by guest.orders.release) — the queue already hides
// anything failing either check (listQueue above), but that's UX only; this
// is the server-enforced version, same "not just hidden, rejected too"
// pattern the rest of the app follows. Counter-experience restaurants only.
// Raises for the whole batch if any item fails either check, same
// all-or-nothing shape submit_order() uses for its own availability guard.
async function assertCounterBillsSettled(
	ctx: Context,
	restaurantId: string,
	experience: Database["public"]["Enums"]["restaurant_experience"] | null,
	orderItemIds: string[],
): Promise<void> {
	if (experience !== "counter") return;

	const itemsResult = await ctx.auth
		.from("order_items")
		.select("order_id, released_at")
		.eq("restaurant_id", restaurantId)
		.in("id", orderItemIds);
	if (itemsResult.error) {
		throw dbError("Unable to update the order.", itemsResult.error);
	}
	if ((itemsResult.data ?? []).some((row) => row.released_at == null)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The guest hasn't sent this item to the kitchen yet.",
		});
	}
	const orderIds = [
		...new Set((itemsResult.data ?? []).map((row) => row.order_id)),
	];
	if (orderIds.length === 0) return;

	const ordersResult = await ctx.auth
		.from("orders")
		.select("session_id")
		.eq("restaurant_id", restaurantId)
		.in("id", orderIds);
	if (ordersResult.error) {
		throw dbError("Unable to update the order.", ordersResult.error);
	}
	const sessionIds = [
		...new Set((ordersResult.data ?? []).map((row) => row.session_id)),
	];
	if (sessionIds.length === 0) return;

	const billsResult = await ctx.auth
		.from("bills")
		.select("session_id, status")
		.eq("restaurant_id", restaurantId)
		.in("session_id", sessionIds);
	if (billsResult.error) {
		throw dbError("Unable to update the order.", billsResult.error);
	}
	const settledSessionIds = new Set(
		(billsResult.data ?? [])
			.filter((bill) => bill.status === "settled")
			.map((bill) => bill.session_id),
	);
	const hasUnpaidSession = sessionIds.some(
		(sessionId) => !settledSessionIds.has(sessionId),
	);
	if (hasUnpaidSession) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This order hasn't been paid yet — settle the bill before the kitchen can start.",
		});
	}
}

// Shared by advanceBatch and serveBatch below: both move a batch of order
// items from one expected status to another. `status = from` in the filter
// guards against a stale double-tap racing an already-advanced item.
async function updateOrderItemsStatus(
	ctx: Context,
	restaurantId: string,
	orderItemIds: string[],
	from: OrderItemStatus,
	changes: Database["public"]["Tables"]["order_items"]["Update"],
): Promise<{ updatedIds: string[] }> {
	const { data, error } = await ctx.auth
		.from("order_items")
		.update(changes)
		.eq("restaurant_id", restaurantId)
		.eq("status", from)
		.in("id", orderItemIds)
		.select("id");

	if (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Unable to update the order.",
			cause: error,
		});
	}

	return { updatedIds: (data ?? []).map((row) => row.id) };
}

export const kitchenRouter = router({
	listQueue: authedProcedure
		.input(z.object({ restaurantId: restaurantIdSchema }))
		.query(async ({ ctx, input }) => {
			const [restaurantResult, itemsResult] = await Promise.all([
				ctx.auth
					.from("restaurants")
					.select("id, name, experience")
					.eq("id", input.restaurantId)
					.maybeSingle(),
				ctx.auth
					.from("order_items")
					.select(
						"id, item_name, quantity, cancelled_quantity, status, order_id, preparing_at, ready_at, released_at",
					)
					.eq("restaurant_id", input.restaurantId)
					.in("status", ["placed", "preparing", "ready"]),
			]);

			assertNoQueueError(restaurantResult.error ?? itemsResult.error);

			if (!restaurantResult.data) {
				return null;
			}

			const items = itemsResult.data ?? [];
			if (items.length === 0) {
				return { restaurant: restaurantResult.data, items: [] };
			}

			const orderIds = [...new Set(items.map((item) => item.order_id))];
			const { data: orders, error: ordersError } = await ctx.auth
				.from("orders")
				.select("id, session_id, placed_at")
				.eq("restaurant_id", input.restaurantId)
				.in("id", orderIds);

			assertNoQueueError(ordersError);

			const ordersById = new Map((orders ?? []).map((o) => [o.id, o]));
			const sessionIds = [...new Set((orders ?? []).map((o) => o.session_id))];

			const [
				{ data: tables, error: tablesError },
				{ data: bills, error: billsError },
			] = await Promise.all([
				ctx.auth
					.from("restaurant_tables")
					.select("session_id, label")
					.eq("restaurant_id", input.restaurantId)
					.in("session_id", sessionIds),
				// Counter has no restaurant_tables row (tableLabelsBySession stays
				// empty for it), so its guest-facing identifier here is the same
				// daily_token shown on the guest bill page. `status` rides along so
				// unpaid Counter orders can be filtered out below — the item's own
				// `preparing`/`ready` status can't tell an unsettled bill apart from
				// a settled one, since both permit those states.
				ctx.auth
					.from("bills")
					.select("session_id, daily_token, status")
					.eq("restaurant_id", input.restaurantId)
					.in("session_id", sessionIds),
			]);

			assertNoQueueError(tablesError ?? billsError);

			const tableLabelsBySession = new Map<string, string[]>();
			for (const table of tables ?? []) {
				if (!table.session_id) continue;
				const labels = tableLabelsBySession.get(table.session_id) ?? [];
				labels.push(table.label);
				tableLabelsBySession.set(table.session_id, labels);
			}

			const tokenBySession = new Map<string, number>();
			const billStatusBySession = new Map<string, string>();
			for (const bill of bills ?? []) {
				if (bill.daily_token != null) {
					tokenBySession.set(bill.session_id, bill.daily_token);
				}
				billStatusBySession.set(bill.session_id, bill.status);
			}
			const isCounter = restaurantResult.data.experience === "counter";

			return {
				restaurant: restaurantResult.data,
				// A partially cancelled 'placed' row (Bills tab, pre-prep) still
				// carries its full ordered quantity — only the remaining,
				// still-billable units should ever reach the kitchen queue.
				items: items
					.map((item) => {
						const order = ordersById.get(item.order_id);
						return {
							id: item.id,
							dish: item.item_name,
							quantity: item.quantity - item.cancelled_quantity,
							status: item.status as "placed" | "preparing" | "ready",
							placedAt: order?.placed_at ?? null,
							preparingAt: item.preparing_at,
							readyAt: item.ready_at,
							tables: order
								? (tableLabelsBySession.get(order.session_id) ?? [])
								: [],
							token: order
								? (tokenBySession.get(order.session_id) ?? null)
								: null,
							sessionId: order?.session_id ?? null,
							releasedAt: item.released_at,
						};
					})
					.filter((item) => item.quantity > 0)
					// Counter-experience gate (core-data-model.md § Lifecycle
					// invariants): kitchen never starts on an unpaid counter order —
					// drop an unsettled 'placed' counter item from the queue
					// entirely, same as before. On top of that, the guest now
					// releases each paid item to the kitchen at their own pace
					// (docs/product.md § Order Lifecycle) — a settled-but-unreleased
					// item still has nothing for the kitchen to do yet either.
					.filter(
						(item) =>
							!(
								isCounter &&
								item.status === "placed" &&
								(billStatusBySession.get(item.sessionId ?? "") !== "settled" ||
									item.releasedAt == null)
							),
					)
					.map(
						({ sessionId: _sessionId, releasedAt: _releasedAt, ...item }) =>
							item,
					),
			};
		}),

	// Advances every order item in one dish batch together — a batch groups
	// order items across tables/orders that share a dish + status
	// (apps/web/lib/kitchen-batches.ts), and the kitchen fires them as one
	// unit. `status = expected from-state` in the filter guards against a
	// stale double-tap racing an already-advanced item.
	advanceBatch: authedProcedure
		.input(
			z.object({
				restaurantId: restaurantIdSchema,
				orderItemIds: z.array(z.string().uuid()).min(1),
				to: z.enum(["preparing", "ready"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// "Update Order Status (Preparing/Ready)" (docs/product.md § RBAC)
			// is Kitchen/Manager/Owner — Waiter can view the queue but not
			// advance it.
			const experience = await requireFullServiceRole(ctx, input.restaurantId, [
				"kitchen",
				"manager",
				"owner",
			]);

			if (input.to === "preparing") {
				await assertCounterBillsSettled(
					ctx,
					input.restaurantId,
					experience,
					input.orderItemIds,
				);
			}

			const now = new Date().toISOString();
			const changes =
				input.to === "preparing"
					? { status: input.to, preparing_at: now }
					: { status: input.to, ready_at: now };

			return updateOrderItemsStatus(
				ctx,
				input.restaurantId,
				input.orderItemIds,
				ADVANCE_FROM[input.to],
				changes,
			);
		}),

	// Serve Order (docs/product.md § RBAC "Serve Order (set Served)") is
	// Waiter/Manager/Owner for Full-Service — the inverse split of
	// advanceBatch above, which excludes Waiter. Ready is the only status
	// this ever moves from: Served is terminal (order-item.ts /
	// core-data-model.md lifecycle). Counter-experience restaurants swap
	// Waiter for Kitchen here (docs/product.md § Dineinly Experiences —
	// Counter is self-service, no waiter marks the pickup).
	serveBatch: authedProcedure
		.input(
			z.object({
				restaurantId: restaurantIdSchema,
				orderItemIds: z.array(z.string().uuid()).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Menu-block + experience read in one fetch, reused below instead of
			// requireFullServiceRole's own internal one — Serve's allowed roles
			// depend on the experience, so it has to be known before the role
			// check runs, not just alongside it.
			const experience = await assertFullServiceExperience(
				ctx,
				input.restaurantId,
			);

			// Counter is self-service — Kitchen marks the pickup complete
			// (docs/product.md § Dineinly Experiences), unlike Full-Service where
			// only Waiter/Manager/Owner may (Kitchen never touches Serve there).
			const allowedRoles: StaffRole[] =
				experience === "counter"
					? ["kitchen", "manager", "owner"]
					: ["waiter", "manager", "owner"];

			await requireStaffRole(ctx, input.restaurantId, allowedRoles);

			return updateOrderItemsStatus(
				ctx,
				input.restaurantId,
				input.orderItemIds,
				"ready",
				{ status: "served" },
			);
		}),

	listAvailability: authedProcedure
		.input(z.object({ restaurantId: restaurantIdSchema }))
		.query(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth
				.from("menu_items")
				.select("id, name, availability")
				.eq("restaurant_id", input.restaurantId)
				.eq("status", "active")
				.order("name", { ascending: true });

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to load the dish list.",
					cause: error,
				});
			}

			return data ?? [];
		}),
});
