import { TRPCError } from "@trpc/server";
import type { Database } from "@workspace/db";
import { z } from "zod";
import type { Context } from "../trpc/context";
import { authedProcedure, router } from "../trpc/init";
import { requireStaffRole } from "../trpc/rbac";

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
					.select("id, name")
					.eq("id", input.restaurantId)
					.maybeSingle(),
				ctx.auth
					.from("order_items")
					.select(
						"id, item_name, quantity, cancelled_quantity, status, order_id, preparing_at, ready_at",
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

			const { data: tables, error: tablesError } = await ctx.auth
				.from("restaurant_tables")
				.select("session_id, label")
				.eq("restaurant_id", input.restaurantId)
				.in("session_id", sessionIds);

			assertNoQueueError(tablesError);

			const tableLabelsBySession = new Map<string, string[]>();
			for (const table of tables ?? []) {
				if (!table.session_id) continue;
				const labels = tableLabelsBySession.get(table.session_id) ?? [];
				labels.push(table.label);
				tableLabelsBySession.set(table.session_id, labels);
			}

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
						};
					})
					.filter((item) => item.quantity > 0),
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
			await requireStaffRole(ctx, input.restaurantId, [
				"kitchen",
				"manager",
				"owner",
			]);

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
	// Waiter/Manager/Owner — the inverse split of advanceBatch above, which
	// excludes Waiter. Ready is the only status this ever moves from: Served
	// is terminal (order-item.ts / core-data-model.md lifecycle), and
	// Kitchen never touches this transition at all, not even to view it as
	// an option — the Ready column offers no advance action for Kitchen.
	serveBatch: authedProcedure
		.input(
			z.object({
				restaurantId: restaurantIdSchema,
				orderItemIds: z.array(z.string().uuid()).min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, [
				"waiter",
				"manager",
				"owner",
			]);

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
