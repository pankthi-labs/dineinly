"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import { downloadPdf } from "@/lib/download-pdf";
import { formatBillAmount, titleCase } from "@/lib/format";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import { RestaurantNavHeader } from "../../restaurant-nav-header";

const ITEM_STATUS_LABEL: Record<string, string> = {
	placed: "Placed",
	preparing: "Preparing",
	ready: "Ready",
	served: "Served",
	cancelled: "Cancelled",
};

export default function BillDetailPage() {
	const router = useRouter();
	const { restaurantId, sessionId } = useParams<{
		restaurantId: string;
		sessionId: string;
	}>();

	const [toast, setToast] = useState<ToastState | null>(null);
	const [confirming, setConfirming] = useState<"settle" | "close" | null>(null);
	const [cancellingItemId, setCancellingItemId] = useState<string | null>(null);
	const [isDownloading, setIsDownloading] = useState(false);

	const utils = trpc.useUtils();
	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const billQuery = trpc.bills.get.useQuery({ sessionId });

	const supabase = createClient();
	useBroadcastChannel(supabase, `session:${sessionId}`, {
		"bill.status": () => utils.bills.get.invalidate({ sessionId }),
		"order.new": () => utils.bills.get.invalidate({ sessionId }),
		"order_item.status": () => utils.bills.get.invalidate({ sessionId }),
	});

	function invalidateAndNotify(message: string) {
		utils.bills.get.invalidate({ sessionId });
		utils.bills.list.invalidate();
		setToast({ message, tone: "success" });
	}

	function notifyError(error: { message: string }) {
		setToast({ message: error.message, tone: "error" });
	}

	const requestMutation = trpc.bills.request.useMutation({
		onSuccess: () => invalidateAndNotify("Bill requested."),
		onError: notifyError,
	});

	const waiveMutation = trpc.bills.waiveServiceCharge.useMutation({
		onSuccess: (data) =>
			invalidateAndNotify(
				data.waived ? "Service charge waived." : "Service charge restored.",
			),
		onError: notifyError,
	});

	const cancelItemMutation = trpc.bills.cancelOrderItem.useMutation({
		onSuccess: () => {
			setCancellingItemId(null);
			invalidateAndNotify("Item corrected.");
		},
		onError: (error) => {
			setCancellingItemId(null);
			notifyError(error);
		},
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

	async function handleDownload() {
		setIsDownloading(true);
		try {
			const result = await utils.bills.downloadPdf.fetch({ sessionId });
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

	if (billQuery.isPending) {
		return (
			<div className="min-h-dvh bg-background">
				<RestaurantNavHeader
					restaurantId={restaurantId}
					restaurantName={restaurantQuery.data?.name ?? ""}
					active="Bills"
				/>
				<main className="mx-auto max-w-md px-5 pt-6 pb-16">
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
				<main className="mx-auto max-w-md px-5 pt-6 pb-16 text-center">
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

	return (
		<div className="min-h-dvh bg-background text-primary">
			<div className="print:hidden">
				<RestaurantNavHeader
					restaurantId={restaurantId}
					restaurantName={restaurantQuery.data?.name ?? ""}
					active="Bills"
				/>
			</div>

			<main className="mx-auto max-w-md px-5 pt-6 pb-16">
				<div className="flex items-center justify-between print:hidden">
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

				<div className="mt-6 rounded-xl border border-divider bg-surface p-5 tabular-nums">
					<header className="text-center">
						<h1 className="text-3xl">{data.restaurant.name}</h1>
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
							· Table {data.tableLabel || "—"}
						</p>
					</header>

					<div className="mt-4 border-divider border-t border-dashed" />

					{data.items.length === 0 ? (
						<p className="mt-6 text-center text-muted">No items ordered yet.</p>
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
										Amount
									</th>
									<th
										scope="col"
										className="pb-3 pl-3 text-right text-caps text-secondary print:hidden"
									>
										Correct
									</th>
								</tr>
							</thead>
							<tbody>
								{data.items.map((item) => (
									<tr key={item.id}>
										<td className="py-1.5 align-top text-base text-primary">
											<span className="mr-1 text-muted text-sm">
												{item.quantity}×
											</span>
											<span
												className={
													item.status === "cancelled"
														? "text-muted line-through"
														: ""
												}
											>
												{titleCase(item.name)}
											</span>
											<span className="ml-2 text-caps text-muted">
												{ITEM_STATUS_LABEL[item.status]}
											</span>
										</td>
										<td
											className={`py-1.5 pl-3 text-right align-top text-base ${
												item.status === "cancelled"
													? "text-muted line-through"
													: "text-primary"
											}`}
										>
											{formatBillAmount(item.unitPrice * item.quantity)}
										</td>
										<td className="py-1.5 pl-3 text-right align-top print:hidden">
											{item.cancellable && canCorrect ? (
												<button
													type="button"
													onClick={() => setCancellingItemId(item.id)}
													aria-label={`Cancel ${titleCase(item.name)}`}
													className="text-accent-secondary text-caps hover:opacity-80"
												>
													Cancel
												</button>
											) : null}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}

					<div className="mt-5 border-divider border-t border-dashed" />

					<dl className="mt-4 flex flex-col gap-2">
						<TotalsRow label="Subtotal" amount={data.subtotal} strong />
						{data.taxSlabs.map((slab) => (
							<Fragment key={`cgst-${slab.ratePercent}`}>
								<TotalsRow
									label={`CGST (${slab.ratePercent}%)`}
									amount={slab.cgst}
								/>
								<TotalsRow
									label={`SGST (${slab.ratePercent}%)`}
									amount={slab.sgst}
								/>
							</Fragment>
						))}
						{data.serviceChargeWaived ? (
							<div className="flex items-baseline justify-between text-sm">
								<dt className="text-secondary">Service Charge (waived)</dt>
								<dd className="text-muted line-through">
									{formatBillAmount(0)}
								</dd>
							</div>
						) : data.serviceChargeRatePercent > 0 ? (
							<TotalsRow
								label={`Service Charge (${data.serviceChargeRatePercent}%)`}
								amount={data.serviceCharge}
							/>
						) : null}
					</dl>

					<div className="mt-4 border-divider border-t" />

					<div className="mt-4 flex items-baseline justify-between">
						<span className="text-xl">Grand Total</span>
						<span className="text-2xl text-accent">
							{formatBillAmount(data.total)}
						</span>
					</div>
				</div>

				<div className="mt-6 flex flex-col gap-3 print:hidden">
					{!canCorrect || data.status === "open" ? null : (
						<button
							type="button"
							onClick={() =>
								waiveMutation.mutate({
									sessionId,
									waived: !data.serviceChargeWaived,
								})
							}
							disabled={waiveMutation.isPending}
							className="rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
						>
							{data.serviceChargeWaived
								? "Restore Service Charge"
								: "Waive Service Charge"}
						</button>
					)}

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

					{data.status !== "settled" ? (
						<button
							type="button"
							onClick={() => setConfirming("settle")}
							disabled={settleMutation.isPending}
							className="rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
						>
							Mark Bill Settled
						</button>
					) : data.sessionStatus === "active" ? (
						<>
							<button
								type="button"
								onClick={() => setConfirming("close")}
								disabled={data.hasItemsInProgress || closeMutation.isPending}
								className="rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
							>
								Close Session
							</button>
							{data.hasItemsInProgress ? (
								<p className="text-center text-error text-sm">
									This session still has orders in progress — every item must be
									served or cancelled before it can close.
								</p>
							) : null}
						</>
					) : (
						<p className="text-center text-muted text-sm">Session closed.</p>
					)}
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

			{cancellingItemId ? (
				<ConfirmDialog
					titleId="cancel-item-title"
					title={`Cancel ${titleCase(data.items.find((item) => item.id === cancellingItemId)?.name ?? "this item")}?`}
					body="Removes it from the bill. This can't be undone — the guest will need to re-order it if it was a mistake."
					confirmLabel="Cancel Item"
					pendingLabel="Cancelling…"
					onCancel={() => setCancellingItemId(null)}
					onConfirm={() =>
						cancelItemMutation.mutate({ orderItemId: cancellingItemId })
					}
					isPending={cancelItemMutation.isPending}
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
