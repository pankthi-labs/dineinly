"use client";

import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { QuantityPill } from "@/components/quantity-pill";
import { SiteFooter } from "@/components/site-footer";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import { formatPrice, titleCase } from "@/lib/format";
import { trpc } from "@/lib/trpc-client";
import { RestaurantNavHeader } from "../../restaurant-nav-header";

// Order on behalf of guest (docs/product.md § RBAC "Add to Cart"/"Submit
// Order": Waiter/Manager/Owner, or Dineinly Admin). Menu browsing reuses
// menu.listForManagement (Menu Desk's own query), filtered here to active +
// available — Menu Desk itself needs archived/sold-out items visible to
// manage them, this screen doesn't. No spice/salt/ice picker here (unlike
// the guest menu) — a phoned-in or table-side order is relayed verbally more
// often than tapped through preference chips; add one if staff feedback asks
// for it.
//
// Reused for Counter's Bills tab "Add Item" action too (no tableLabel there,
// since Counter has no restaurant_tables row) — copy below branches on that,
// since staff_submit_order() still gates on settle regardless of package:
// Full-Service fires to kitchen the moment this submits; Counter's order
// only joins the guest's paid bill — the guest still releases each item to
// the kitchen at their own pace afterward (app/guest/bill/page.tsx).
export default function FloorOrderPage() {
	const router = useRouter();
	const { restaurantId, sessionId } = useParams<{
		restaurantId: string;
		sessionId: string;
	}>();
	const [toast, setToast] = useState<ToastState | null>(null);
	const [idempotencyKey] = useState(() => crypto.randomUUID());

	const utils = trpc.useUtils();
	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const tablesQuery = trpc.tables.list.useQuery({ restaurantId });
	const menuQuery = trpc.menu.listForManagement.useQuery({ restaurantId });
	const cartQuery = trpc.floor.cart.list.useQuery({ restaurantId, sessionId });

	function invalidateCart() {
		utils.floor.cart.list.invalidate({ restaurantId, sessionId });
	}

	const addItem = trpc.floor.cart.addItem.useMutation({
		onSuccess: invalidateCart,
		onError: (error) => setToast({ message: error.message, tone: "error" }),
	});
	const setQuantity = trpc.floor.cart.setQuantity.useMutation({
		onSuccess: invalidateCart,
	});
	const removeItem = trpc.floor.cart.removeItem.useMutation({
		onSuccess: invalidateCart,
	});
	const tableLabel = (tablesQuery.data ?? [])
		.filter((t) => t.session_id === sessionId)
		.map((t) => t.label)
		.join(", ");
	const isCounter = !tableLabel;
	const cart = cartQuery.data ?? [];
	const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

	const submitOrder = trpc.floor.submitOrder.useMutation({
		onSuccess: () => {
			invalidateCart();
			setToast({
				message: isCounter
					? "Items added to the bill."
					: "Order sent to the kitchen.",
				tone: "success",
			});
			router.push(
				isCounter
					? `/restaurants/${restaurantId}/bills/${sessionId}`
					: `/restaurants/${restaurantId}/floor`,
			);
		},
		onError: (error) => setToast({ message: error.message, tone: "error" }),
	});

	return (
		<div className="min-h-dvh bg-background text-primary">
			<RestaurantNavHeader
				restaurantId={restaurantId}
				restaurantName={restaurantQuery.data?.name ?? ""}
				active="Floor"
			/>

			<main className="px-4 pt-8 pb-24 lg:px-16 lg:pt-12 lg:pb-24 xl:px-24">
				<button
					type="button"
					onClick={() => router.push(`/restaurants/${restaurantId}/floor`)}
					className="-my-3 flex items-center gap-1 py-3 text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
				>
					<ArrowLeft className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
					Floor
				</button>

				<PageHeader
					title={tableLabel ? `Order for Table ${tableLabel}` : "Add Items"}
					description={
						tableLabel
							? "Add items on the guest's behalf — this goes straight to the kitchen."
							: "Add items to this guest's order before they pay — becomes part of their bill."
					}
				/>

				<div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
					<div className="flex flex-col gap-8">
						{menuQuery.isPending ? (
							<div className="skeleton h-64 rounded-xl border border-divider" />
						) : menuQuery.error || !menuQuery.data ? (
							<p role="alert" className="text-error text-sm">
								Couldn't load the menu.
							</p>
						) : (
							menuQuery.data.categories.map((category) => {
								const items = category.items.filter(
									(item) =>
										item.status === "active" &&
										item.availability === "available",
								);
								if (items.length === 0) return null;
								return (
									<section key={category.id}>
										<h2 className="text-caps text-muted">{category.name}</h2>
										<div className="mt-3 flex flex-col">
											{items.map((item) => {
												// Staff cart lines never carry preferences (no spice/salt/ice
												// picker here), so at most one cart row ever matches a menu item.
												const cartRow = cart.find(
													(row) => row.menuItemId === item.id,
												);
												return (
													<div
														key={item.id}
														className="flex items-center justify-between gap-4 border-divider border-b py-4"
													>
														<div className="min-w-0">
															<p className="truncate text-primary">
																{titleCase(item.name)}
															</p>
															<p className="text-secondary text-sm">
																{formatPrice(item.price)}
															</p>
														</div>
														<QuantityPill
															value={cartRow?.quantity ?? 0}
															disabled={
																addItem.isPending || setQuantity.isPending
															}
															onIncrement={() =>
																cartRow
																	? setQuantity.mutate({
																			restaurantId,
																			sessionId,
																			cartItemId: cartRow.id,
																			quantity: cartRow.quantity + 1,
																		})
																	: addItem.mutate({
																			restaurantId,
																			sessionId,
																			menuItemId: item.id,
																			quantity: 1,
																		})
															}
															onDecrement={() =>
																cartRow &&
																setQuantity.mutate({
																	restaurantId,
																	sessionId,
																	cartItemId: cartRow.id,
																	quantity: cartRow.quantity - 1,
																})
															}
														/>
													</div>
												);
											})}
										</div>
									</section>
								);
							})
						)}
					</div>

					<div className="flex flex-col gap-4 rounded-xl border border-divider bg-surface p-5 lg:sticky lg:top-8">
						<h2 className="text-caps text-muted">Current Order</h2>
						{cartQuery.isPending ? (
							<div className="skeleton h-24 rounded-md" />
						) : cart.length === 0 ? (
							<p className="text-muted text-sm">Nothing added yet.</p>
						) : (
							<div className="flex flex-col gap-4">
								{cart.map((item) => (
									<div
										key={item.id}
										className="flex items-center justify-between gap-3"
									>
										<div className="min-w-0">
											<p className="truncate text-primary text-sm">
												{titleCase(item.name)}
												{!item.available ? (
													<span className="ml-2 text-error text-xs">
														Unavailable
													</span>
												) : null}
											</p>
											<button
												type="button"
												onClick={() =>
													removeItem.mutate({
														restaurantId,
														sessionId,
														cartItemId: item.id,
													})
												}
												className="text-caps text-muted hover:text-primary"
											>
												Remove
											</button>
										</div>
										<QuantityPill
											value={item.quantity}
											onDecrement={() =>
												setQuantity.mutate({
													restaurantId,
													sessionId,
													cartItemId: item.id,
													quantity: item.quantity - 1,
												})
											}
											onIncrement={() =>
												setQuantity.mutate({
													restaurantId,
													sessionId,
													cartItemId: item.id,
													quantity: item.quantity + 1,
												})
											}
										/>
									</div>
								))}
								<div className="flex items-center justify-between border-divider border-t pt-4">
									<span className="text-primary">Total</span>
									<span className="text-accent">{formatPrice(total)}</span>
								</div>
							</div>
						)}
					</div>
				</div>

				<SiteFooter variant="compact" className="mt-16 lg:mt-24" />
			</main>

			{cart.length > 0 ? (
				<div className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-divider border-t bg-surface-elevated px-5 py-4">
					<button
						type="button"
						disabled={
							submitOrder.isPending || cart.some((item) => !item.available)
						}
						onClick={() =>
							submitOrder.mutate({ restaurantId, sessionId, idempotencyKey })
						}
						className="mx-auto block w-full max-w-md rounded-md bg-accent px-6 py-4 font-medium text-background text-sm disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isCounter
							? submitOrder.isPending
								? "Adding…"
								: "Add to Bill"
							: submitOrder.isPending
								? "Sending…"
								: "Send to Kitchen"}
					</button>
				</div>
			) : null}

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}
