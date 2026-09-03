"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { QuantityPill } from "@/components/quantity-pill";
import { SiteFooter } from "@/components/site-footer";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import { billableQuantity } from "@/lib/bill-math";
import { downloadPdf } from "@/lib/download-pdf";
import { formatBillAmount, formatBillLocation, titleCase } from "@/lib/format";
import { groupOrderItems } from "@/lib/order-item-groups";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import { RestaurantNavHeader } from "../../restaurant-nav-header";

type EditingAction = { itemId: string; kind: "waive" | "cancel" } | null;

export default function BillDetailPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	// Which of the session's bills to view — Bills tab links here with
	// ?bill=<id> for a specific past round; omitted means the latest
	// (current, actionable) round, same as before this param existed.
	const billId = searchParams.get("bill") ?? undefined;
	const { restaurantId, sessionId } = useParams<{
		restaurantId: string;
		sessionId: string;
	}>();

	const [toast, setToast] = useState<ToastState | null>(null);
	const [confirming, setConfirming] = useState<
		"settle" | "close" | "terminate" | null
	>(null);
	const [isDownloading, setIsDownloading] = useState(false);
	const [editing, setEditing] = useState<EditingAction>(null);
	const [pendingQty, setPendingQty] = useState(0);

	const utils = trpc.useUtils();
	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const billQuery = trpc.bills.get.useQuery({ sessionId, billId });

	// Landing here with no ?bill= means "the current round" — but on Counter a
	// later round created while this page is open would otherwise silently
	// swap the view to that new round the moment its broadcast invalidates
	// this same billId-less query. Pinning the URL to the round actually being
	// looked at the first time we learn its id keeps every round's view
	// independent, matching the Bills tab's own links (bill-row.tsx).
	useEffect(() => {
		if (!billId && billQuery.data?.billId) {
			router.replace(
				`/restaurants/${restaurantId}/bills/${sessionId}?bill=${billQuery.data.billId}`,
			);
		}
	}, [billId, billQuery.data?.billId, restaurantId, sessionId, router]);

	const supabase = createClient();
	useBroadcastChannel(supabase, `session:${sessionId}`, {
		"bill.status": () => utils.bills.get.invalidate({ sessionId, billId }),
		"order.new": () => utils.bills.get.invalidate({ sessionId, billId }),
		"order_item.status": () =>
			utils.bills.get.invalidate({ sessionId, billId }),
	});

	function invalidateAndNotify(message: string) {
		utils.bills.get.invalidate({ sessionId, billId });
		utils.bills.list.invalidate();
		setToast({ message, tone: "success" });
	}

	function notifyError(error: { message: string }) {
		setToast({ message: error.message, tone: "error" });
	}

	function closeEditor() {
		setEditing(null);
	}

	const requestMutation = trpc.bills.request.useMutation({
		onSuccess: () => invalidateAndNotify("Bill requested."),
		onError: notifyError,
	});

	const cancelItemMutation = trpc.bills.cancelOrderItem.useMutation({
		onSuccess: () => {
			closeEditor();
			invalidateAndNotify("Item corrected.");
		},
		onError: (error) => {
			notifyError(error);
		},
	});

	const setQuantityMutation = trpc.bills.setOrderItemQuantity.useMutation({
		onSuccess: () => invalidateAndNotify("Item updated."),
		onError: notifyError,
	});

	const waiveItemMutation = trpc.bills.waiveOrderItem.useMutation({
		onSuccess: (result) => {
			closeEditor();
			invalidateAndNotify(
				result.waivedQuantity > 0 ? "Item waived." : "Waiver removed.",
			);
		},
		onError: (error) => {
			notifyError(error);
		},
	});

	const releaseItemMutation = trpc.bills.releaseOrderItem.useMutation({
		onSuccess: () => invalidateAndNotify("Sent to the kitchen."),
		onError: notifyError,
	});

	const settleMutation = trpc.bills.settle.useMutation({
		onSuccess: () => {
			setConfirming(null);
			invalidateAndNotify("Bill settled.");
		},
		onError: (error) => {
			setConfirming(null);
			notifyError(error);
		},
	});

	const closeMutation = trpc.bills.closeSession.useMutation({
		onSuccess: () => {
			setConfirming(null);
			setToast({ message: "Session closed.", tone: "success" });
			utils.bills.list.invalidate();
			router.push(`/restaurants/${restaurantId}/bills`);
		},
		onError: (error) => {
			setConfirming(null);
			notifyError(error);
		},
	});

	const terminateMutation = trpc.bills.forceTerminate.useMutation({
		onSuccess: () => {
			setConfirming(null);
			setToast({ message: "Session force-terminated.", tone: "success" });
			utils.bills.list.invalidate();
			router.push(`/restaurants/${restaurantId}/bills`);
		},
		onError: (error) => {
			setConfirming(null);
			notifyError(error);
		},
	});

	async function handleDownload() {
		setIsDownloading(true);
		try {
			const result = await utils.bills.downloadPdf.fetch({ sessionId, billId });
			downloadPdf(result.fileName, result.base64);
		} catch (error) {
			setToast({
				message:
					error instanceof Error
						? error.message
						: "Unable to download the bill.",
				tone: "error",
			});
		} finally {
			setIsDownloading(false);
		}
	}

	function openEditor(
		item: {
			id: string;
			quantity: number;
			waivedQuantity: number;
			cancelledQuantity: number;
		},
		kind: "waive" | "cancel",
	) {
		setEditing({ itemId: item.id, kind });
		setPendingQty(
			kind === "waive" ? item.waivedQuantity : item.cancelledQuantity,
		);
	}

	function isPending() {
		return waiveItemMutation.isPending || cancelItemMutation.isPending;
	}

	function applyEditor(item: { id: string }) {
		if (!editing) return;
		if (editing.kind === "waive") {
			waiveItemMutation.mutate({
				orderItemId: item.id,
				waivedQuantity: pendingQty,
			});
		} else {
			cancelItemMutation.mutate({
				orderItemId: item.id,
				cancelledQuantity: pendingQty,
			});
		}
	}

	if (billQuery.isPending) {
		return (
			<div className="min-h-dvh bg-background">
				<RestaurantNavHeader
					restaurantId={restaurantId}
					restaurantName={restaurantQuery.data?.name ?? ""}
					active="Bills"
				/>
				<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
					<div className="skeleton h-96 rounded-xl border border-divider" />
				</main>
			</div>
		);
	}

	if (billQuery.error || !billQuery.data) {
		return (
			<div className="min-h-dvh bg-background">
				<RestaurantNavHeader
					restaurantId={restaurantId}
					restaurantName={restaurantQuery.data?.name ?? ""}
					active="Bills"
				/>
				<main className="px-4 pt-8 pb-10 text-center lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
					<p role="alert" className="text-error text-sm">
						{billQuery.error?.message ?? "Bill not found."}
					</p>
				</main>
			</div>
		);
	}

	const data = billQuery.data;
	const isSettled = data.status === "settled";
	const canCorrect = !isSettled;
	const isCounterBill = data.dailyToken != null;
	// Repeat confirm-cart rounds against the same still-open bill can leave
	// more than one order_item row for the same dish + preferences — merged
	// into one displayed line here (same grouping the guest bill and Kitchen
	// Display batches already use), so staff see one "2x Fried Rice" instead
	// of two separate "1x" rows.
	const itemsById = new Map(data.items.map((item) => [item.id, item]));
	const groups = groupOrderItems(data.items);

	return (
		<div className="min-h-dvh bg-background text-primary">
			<div className="print:hidden">
				<RestaurantNavHeader
					restaurantId={restaurantId}
					restaurantName={restaurantQuery.data?.name ?? ""}
					active="Bills"
				/>
			</div>

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
					<button
						type="button"
						onClick={() => router.push(`/restaurants/${restaurantId}/bills`)}
						className="flex items-center gap-1 text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
					>
						<ArrowLeft
							className="icon-sm"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
						Bills
					</button>
					<div className="flex items-center gap-4">
						<button
							type="button"
							onClick={() => window.print()}
							className="icon-tap-target flex items-center gap-2 text-caps text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary"
						>
							<Printer
								className="icon-sm"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							Print
						</button>
						<button
							type="button"
							onClick={handleDownload}
							disabled={isDownloading}
							className="icon-tap-target flex items-center gap-2 text-caps text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Download
								className="icon-sm"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							{isDownloading ? "Preparing…" : "Download"}
						</button>
					</div>
				</div>

				{/* Staff editor view: full-width item corrections + action panel,
				    not the narrow printed-bill look — that's reserved for the guest
				    screen and the print/download output below (product.md § Bills
				    tab). */}
				<div className="mt-6 flex items-baseline justify-between gap-4 print:hidden">
					<div>
						<h1 className="text-3xl">
							{data.dailyToken != null
								? `Token ${data.dailyToken}`
								: formatBillLocation(data.tableLabel)}
						</h1>
						<p className="text-secondary text-sm">
							{data.billNumber
								? `Bill #${data.billNumber}`
								: "Bill not yet requested"}
						</p>
					</div>
					<span className="shrink-0 text-3xl text-accent tabular-nums">
						{formatBillAmount(data.total)}
					</span>
				</div>

				{data.dailyToken != null && data.status !== "settled" ? (
					<Link
						href={`/restaurants/${restaurantId}/floor/${sessionId}`}
						className="mt-4 inline-flex items-center gap-1 text-accent text-caps hover:opacity-80 print:hidden"
					>
						Add Items
					</Link>
				) : null}

				<div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-8 print:hidden">
					{groups.length === 0 ? (
						<p className="text-muted">No items ordered yet.</p>
					) : (
						<div className="overflow-x-auto rounded-xl border border-divider">
							{/* table-fixed + colgroup pin every column's width up front —
							without it, the browser recomputes column widths from
							content on every render, so the actions column (button vs.
							pill vs. short text vs. nothing) visibly resizes and its
							right-aligned content jumps sideways as rows change state. */}
							<table className="w-full table-fixed border-collapse bg-surface">
								<colgroup>
									<col />
									<col className="w-24" />
									<col className="w-28" />
									<col className="w-52" />
								</colgroup>
								<thead>
									<tr className="border-divider border-b">
										<th
											scope="col"
											className="px-6 py-3 text-left text-caps text-secondary"
										>
											Item
										</th>
										<th
											scope="col"
											className="px-3 py-3 text-right text-caps text-secondary"
										>
											Rate
										</th>
										<th
											scope="col"
											className="px-3 py-3 text-right text-caps text-secondary"
										>
											Amount
										</th>
										<th scope="col" className="px-5 py-3 text-right">
											<span className="sr-only">Actions</span>
										</th>
									</tr>
								</thead>
								<tbody>
									{groups.map((group) => {
										const fullyWaived = group.waivedQuantity >= group.quantity;
										const billedQuantity = billableQuantity(
											group.quantity,
											group.waivedQuantity,
											group.cancelledQuantity,
										);
										const struck = billedQuantity <= 0;
										const activeItem = itemsById.get(group.activeItemId);
										const isEditingThis =
											editing?.itemId === group.activeItemId;
										const rowClass = struck
											? "text-muted line-through"
											: "text-primary";
										// The pill shows the merged quantity but every click still
										// edits one underlying row (activeItem) outright — see
										// order-item-groups.ts.
										const showPill =
											isCounterBill && group.cancellable && canCorrect;
										const waiveMax = activeItem
											? activeItem.quantity - activeItem.cancelledQuantity
											: 0;
										const cancelMax = activeItem
											? activeItem.quantity - activeItem.waivedQuantity
											: 0;
										return (
											<Fragment key={group.key}>
												<tr className="border-divider border-t">
													<td
														className={`px-6 py-5 align-top text-lg ${rowClass}`}
													>
														{showPill ? null : (
															<span className="mr-1 text-base text-muted">
																{group.quantity}x
															</span>
														)}
														{titleCase(group.name)}
														{group.modifiers ? (
															<span className="ml-1 text-muted text-sm">
																({group.modifiers})
															</span>
														) : null}
														{group.waivedQuantity > 0 && !fullyWaived ? (
															<p className="mt-1 text-caps text-muted">
																{group.waivedQuantity} of {group.quantity}{" "}
																waived
															</p>
														) : null}
														{group.cancelledQuantity > 0 && !struck ? (
															<p className="mt-1 text-caps text-muted">
																{group.cancelledQuantity} of {group.quantity}{" "}
																cancelled
															</p>
														) : null}
													</td>
													<td
														className={`px-3 py-5 text-right align-top tabular-nums ${rowClass}`}
													>
														{formatBillAmount(group.unitPrice)}
													</td>
													<td
														className={`px-3 py-5 text-right align-top tabular-nums ${rowClass}`}
													>
														{formatBillAmount(group.unitPrice * billedQuantity)}
													</td>
													<td className="px-5 py-5 align-middle">
														{isCounterBill ? (
															// Fixed min-height so this cell holds its place
															// when Send to Kitchen's button gives way to a
															// shorter Waive link (or nothing) post-click —
															// without it every row below jumps the moment the
															// button disappears.
															<div className="flex min-h-11 items-center justify-end">
																{isSettled &&
																group.releasableItemIds.length > 0 ? (
																	<button
																		type="button"
																		disabled={releaseItemMutation.isPending}
																		onClick={() =>
																			releaseItemMutation.mutate({
																				orderItemIds: group.releasableItemIds,
																			})
																		}
																		className="rounded-md border border-divider px-4 py-3 text-caps text-secondary transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
																	>
																		{releaseItemMutation.isPending
																			? "Sending…"
																			: "Send to Kitchen"}
																	</button>
																) : showPill && activeItem ? (
																	<QuantityPill
																		value={billedQuantity}
																		disabled={setQuantityMutation.isPending}
																		onDecrement={() =>
																			setQuantityMutation.mutate({
																				orderItemId: activeItem.id,
																				quantity: activeItem.quantity - 1,
																			})
																		}
																		onIncrement={() =>
																			setQuantityMutation.mutate({
																				orderItemId: activeItem.id,
																				quantity: activeItem.quantity + 1,
																			})
																		}
																	/>
																) : group.waivable &&
																	canCorrect &&
																	activeItem ? (
																	<button
																		type="button"
																		onClick={() =>
																			isEditingThis && editing?.kind === "waive"
																				? closeEditor()
																				: openEditor(activeItem, "waive")
																		}
																		aria-expanded={
																			isEditingThis && editing?.kind === "waive"
																		}
																		className="text-caps text-secondary hover:text-primary"
																	>
																		{group.waivedQuantity > 0
																			? "Edit waiver"
																			: "Waive"}
																	</button>
																) : null}
															</div>
														) : (
															<div className="flex flex-col items-end gap-2">
																{group.waivable && canCorrect && activeItem ? (
																	<button
																		type="button"
																		onClick={() =>
																			isEditingThis && editing?.kind === "waive"
																				? closeEditor()
																				: openEditor(activeItem, "waive")
																		}
																		aria-expanded={
																			isEditingThis && editing?.kind === "waive"
																		}
																		className="text-caps text-secondary hover:text-primary"
																	>
																		{group.waivedQuantity > 0
																			? "Edit waiver"
																			: "Waive"}
																	</button>
																) : null}
																{group.cancellable &&
																canCorrect &&
																activeItem ? (
																	<button
																		type="button"
																		onClick={() =>
																			isEditingThis &&
																			editing?.kind === "cancel"
																				? closeEditor()
																				: openEditor(activeItem, "cancel")
																		}
																		aria-expanded={
																			isEditingThis &&
																			editing?.kind === "cancel"
																		}
																		className="text-accent-secondary text-caps hover:opacity-80"
																	>
																		{group.cancelledQuantity > 0
																			? "Edit cancel"
																			: "Cancel"}
																	</button>
																) : null}
															</div>
														)}
													</td>
												</tr>
												{isEditingThis && editing && activeItem ? (
													<tr className="border-divider border-t bg-background">
														<td colSpan={4} className="px-6 py-4">
															<div className="flex flex-wrap items-center justify-between gap-4">
																<div className="flex items-center gap-3">
																	<span className="text-caps text-muted">
																		{editing.kind === "waive"
																			? "Waive quantity"
																			: "Cancel quantity"}
																	</span>
																	<QuantityPill
																		value={pendingQty}
																		max={
																			editing.kind === "waive"
																				? waiveMax
																				: cancelMax
																		}
																		disabled={isPending()}
																		onDecrement={() =>
																			setPendingQty((qty) =>
																				Math.max(0, qty - 1),
																			)
																		}
																		onIncrement={() =>
																			setPendingQty((qty) =>
																				Math.min(
																					editing.kind === "waive"
																						? waiveMax
																						: cancelMax,
																					qty + 1,
																				),
																			)
																		}
																	/>
																	<span className="text-secondary text-sm">
																		of {activeItem.quantity}
																	</span>
																</div>
																<div className="flex items-center gap-4">
																	<button
																		type="button"
																		onClick={closeEditor}
																		disabled={isPending()}
																		className="text-caps text-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
																	>
																		Discard
																	</button>
																	<button
																		type="button"
																		onClick={() => applyEditor(activeItem)}
																		disabled={isPending()}
																		className="text-accent text-caps hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
																	>
																		{isPending() ? "Applying…" : "Apply"}
																	</button>
																</div>
															</div>
															{editing.kind === "cancel" &&
															pendingQty === activeItem.quantity ? (
																<p className="mt-3 text-secondary text-sm">
																	Cancelling the full quantity removes this item
																	from the kitchen queue for good.
																</p>
															) : null}
														</td>
													</tr>
												) : null}
											</Fragment>
										);
									})}
								</tbody>
							</table>
						</div>
					)}

					<div className="flex flex-col gap-6 lg:sticky lg:top-8">
						<dl className="flex flex-col gap-2 rounded-xl border border-divider bg-surface p-5 tabular-nums">
							<TaxAndServiceRows data={data} />
							<div className="mt-2 flex items-baseline justify-between gap-4 border-divider border-t pt-2">
								<span className="text-lg">Grand Total</span>
								<span className="text-accent text-xl">
									{formatBillAmount(data.total)}
								</span>
							</div>
						</dl>

						{data.isLatestBill ? (
							<div className="flex flex-col gap-3">
								{data.status === "open" ? (
									<button
										type="button"
										onClick={() => requestMutation.mutate({ sessionId })}
										disabled={requestMutation.isPending}
										className="rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
									>
										{requestMutation.isPending ? "Requesting…" : "Request Bill"}
									</button>
								) : null}

								{data.status === "requested" ? (
									<button
										type="button"
										onClick={() => setConfirming("settle")}
										disabled={settleMutation.isPending}
										className="rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
									>
										Mark Bill Settled
									</button>
								) : null}

								{/* Full-Service only (docs/product.md § Bills tab: "Counter has
								no equivalent button") — the routine, non-override end of a
								visit, gated by close_session() on every bill settled and
								nothing left in progress. Counter only ever ends via idle
								auto-sweep or the Force-Terminate override below. */}
								{!isCounterBill &&
								data.status === "settled" &&
								data.sessionStatus === "active" ? (
									<>
										<button
											type="button"
											onClick={() => setConfirming("close")}
											disabled={
												data.hasItemsInProgress || closeMutation.isPending
											}
											className="rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
										>
											Close Session
										</button>
										{data.hasItemsInProgress ? (
											<p className="text-center text-error text-sm">
												This session still has orders in progress — every item
												must be served or cancelled before it can close.
											</p>
										) : null}
									</>
								) : null}

								{data.sessionStatus === "active" ? (
									<button
										type="button"
										onClick={() => setConfirming("terminate")}
										disabled={terminateMutation.isPending}
										className="rounded-md border border-error px-6 py-3 font-medium text-error text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
									>
										Force-Terminate Session
									</button>
								) : null}
							</div>
						) : null}
					</div>
				</div>

				{/* Print/download output: the actual printed-bill layout, same
				    presentation as the guest bill screen (product.md § Bills tab),
				    built from the merged billable lines rather than the raw item
				    list above. */}
				<div className="mx-auto hidden max-w-md rounded-xl border border-divider bg-surface p-5 tabular-nums print:block">
					<header className="text-center">
						<h1 className="text-3xl">{titleCase(data.restaurant.name)}</h1>
						<p className="mt-2 text-secondary text-sm">
							{data.restaurant.address}, {data.restaurant.city},{" "}
							{data.restaurant.state} {data.restaurant.pincode}
						</p>
						<p className="mt-1 text-muted text-xs">
							GSTIN: {data.restaurant.gstNumber}
						</p>
						<p className="mt-1 text-caps text-muted">
							{data.billNumber
								? `Bill #${data.billNumber}`
								: "Not yet requested"}{" "}
							·{" "}
							{data.dailyToken != null
								? `Token ${data.dailyToken}`
								: formatBillLocation(data.tableLabel)}
						</p>
					</header>

					<div className="mt-4 border-divider border-t border-dashed" />

					{data.lines.length === 0 ? (
						<p className="mt-6 text-center text-muted">
							No billable items yet.
						</p>
					) : (
						<table className="mt-4 w-full border-collapse">
							<thead>
								<tr>
									<th
										scope="col"
										className="pb-3 text-left text-caps text-secondary"
									>
										Item
									</th>
									<th
										scope="col"
										className="pb-3 pl-3 text-right text-caps text-secondary"
									>
										Rate
									</th>
									<th
										scope="col"
										className="pb-3 pl-3 text-right text-caps text-secondary"
									>
										Amount
									</th>
								</tr>
							</thead>
							<tbody>
								{data.lines.map((line) => (
									<tr
										key={`${line.name}:${line.unitPrice}:${line.modifiers ?? ""}`}
									>
										<td className="py-1.5 align-top text-base text-primary">
											<span className="mr-1 text-muted text-sm">
												{line.quantity}×
											</span>
											{titleCase(line.name)}
											{line.modifiers ? (
												<span className="ml-1 text-muted text-sm">
													({line.modifiers})
												</span>
											) : null}
										</td>
										<td className="py-1.5 pl-3 text-right align-top text-secondary text-sm">
											{formatBillAmount(line.unitPrice)}
										</td>
										<td className="py-1.5 pl-3 text-right align-top text-base text-primary">
											{formatBillAmount(line.amount)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}

					<div className="mt-5 border-divider border-t border-dashed" />

					<dl className="mt-4 flex flex-col gap-2">
						<TaxAndServiceRows data={data} />
					</dl>

					<div className="mt-4 border-divider border-t" />

					<div className="mt-4 flex items-baseline justify-between gap-4">
						<span className="text-xl">Grand Total</span>
						<span className="text-2xl text-accent">
							{formatBillAmount(data.total)}
						</span>
					</div>
				</div>

				<div className="print:hidden">
					<SiteFooter variant="compact" className="mt-16 lg:mt-24" />
				</div>
			</main>

			{confirming === "settle" ? (
				<ConfirmDialog
					titleId="settle-bill-title"
					title="Mark bill settled?"
					body="This freezes the total. Confirm the restaurant has received payment through cash, card, UPI, or another external method — Dineinly doesn't process payments itself."
					confirmLabel="Mark Settled"
					pendingLabel="Settling…"
					onCancel={() => setConfirming(null)}
					onConfirm={() => settleMutation.mutate({ sessionId })}
					isPending={settleMutation.isPending}
				/>
			) : null}

			{confirming === "close" ? (
				<ConfirmDialog
					titleId="close-session-title"
					title="Close this session?"
					body="This frees every table in this session. The next QR scan starts a brand new session — this bill stays in your history."
					confirmLabel="Close Session"
					pendingLabel="Closing…"
					onCancel={() => setConfirming(null)}
					onConfirm={() => closeMutation.mutate({ sessionId })}
					isPending={closeMutation.isPending}
				/>
			) : null}

			{confirming === "terminate" ? (
				<ConfirmDialog
					titleId="terminate-session-title"
					title="Force-terminate this session?"
					body={
						data.status === "settled"
							? isCounterBill
								? "This closes the session. The settled bill stays exactly as it is in your history."
								: "This frees every table in this session. The settled bill stays exactly as it is in your history."
							: isCounterBill
								? "This closes the session and voids the open bill — it won't appear as revenue. Sessions only auto-close once their bill is settled and every item is served, so use this to clear one stuck before that point, such as a guest who left without paying."
								: "This frees every table in this session and voids the open bill — it won't appear as revenue. Use this only for an abandoned table (walkout)."
					}
					confirmLabel="Force-Terminate"
					pendingLabel="Terminating…"
					onCancel={() => setConfirming(null)}
					onConfirm={() => terminateMutation.mutate({ sessionId })}
					isPending={terminateMutation.isPending}
				/>
			) : null}

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}

function TotalsRow({
	label,
	amount,
	strong,
}: {
	label: string;
	amount: number;
	strong?: boolean;
}) {
	return (
		<div
			className={`flex items-baseline justify-between ${strong ? "text-base" : "text-sm"}`}
		>
			<dt className={strong ? "font-medium text-primary" : "text-secondary"}>
				{label}
			</dt>
			<dd className={strong ? "font-medium text-primary" : "text-primary"}>
				{formatBillAmount(amount)}
			</dd>
		</div>
	);
}

// Subtotal + tax slabs + service charge rows, shared by the staff editor
// view's totals panel and the printed-bill layout below it — same rows,
// just wrapped in a differently styled <dl> (the printed layout also skips
// the Grand Total row this component doesn't render, since that row is
// styled differently in each context).
function TaxAndServiceRows({
	data,
}: {
	data: {
		subtotal: number;
		taxSlabs: { ratePercent: number; cgst: number; sgst: number }[];
	};
}) {
	return (
		<>
			<TotalsRow label="Subtotal" amount={data.subtotal} strong />
			{data.taxSlabs.map((slab) => (
				<Fragment key={slab.ratePercent}>
					<TotalsRow label={`CGST (${slab.ratePercent}%)`} amount={slab.cgst} />
					<TotalsRow label={`SGST (${slab.ratePercent}%)`} amount={slab.sgst} />
				</Fragment>
			))}
		</>
	);
}
