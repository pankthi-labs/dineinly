"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GuestBillReceipt } from "@/components/guest-bill-receipt";
import { GuestPageHeader } from "@/components/guest-page-header";
import {
	GuestError,
	GuestLoading,
	NoGuestSession,
} from "@/components/guest-page-states";
import { OrderGroupCard } from "@/components/order-status-groups";
import { counterOrderGroups } from "@/lib/order-groups";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { useGuestRealtime } from "@/lib/realtime/use-guest-realtime";
import { trpc } from "@/lib/trpc-client";

// The itemized receipt — reached only after Request Bill (My Orders §
// app/guest/orders/page.tsx, which shows the live running subtotal and is
// where Request Bill actually lives). This screen assumes the bill has
// already been requested; if it somehow lands here pre-request (stale
// bookmark, back button), it bounces back to My Orders rather than showing
// a half-built page.
export default function GuestBillPage() {
	const router = useRouter();
	const bill = trpc.guest.bill.get.useQuery(undefined, { retry: false });
	// Counter only (dailyToken is null on every other experience) — reuses the
	// same guest.orders.list query and OrderGroup pattern as the Full-Service
	// "My Orders" screen (app/guest/orders/page.tsx). Independent of *this*
	// bill's own status: guest.orders.list already scopes itself to
	// settled-bill items only, so a still-unpaid new round (Add More Items
	// before settling) never hides an earlier, already-settled round's items
	// still awaiting pickup.
	const showOrderStatus = bill.data?.dailyToken != null;
	const orders = trpc.guest.orders.list.useQuery(undefined, {
		enabled: showOrderStatus,
	});
	const utils = trpc.useUtils();
	const [sendingKey, setSendingKey] = useState<string | null>(null);
	const releaseItem = trpc.guest.orders.release.useMutation({
		onSettled: () => {
			setSendingKey(null);
			utils.guest.orders.list.invalidate();
		},
	});

	const { client, sessionId } = useGuestRealtime();
	useBroadcastChannel(client, sessionId ? `session:${sessionId}` : null, {
		// Settling flips which of this session's items guest.orders.list even
		// returns (Counter-experience gate: hidden from "Ready to send" etc.
		// until its own bill settles) — bill.get alone leaves the order-status
		// section below stuck until something else refetches orders.list.
		"bill.status": () => {
			utils.guest.bill.get.invalidate();
			utils.guest.orders.list.invalidate();
		},
		"order.new": () => {
			utils.guest.bill.get.invalidate();
			utils.guest.orders.list.invalidate();
		},
		"order_item.status": () => {
			utils.guest.bill.get.invalidate();
			utils.guest.orders.list.invalidate();
		},
	});

	// Guest/Menu experiences never have a bill (docs/product.md § Dineinly
	// Experiences) — guest.bill.get throws FORBIDDEN for them, server-side.
	const experienceBlocked = bill.error?.data?.code === "FORBIDDEN";

	useEffect(() => {
		if (bill.data?.status === "open" || experienceBlocked) {
			router.replace(experienceBlocked ? "/guest/menu" : "/guest/orders");
		}
	}, [bill.data?.status, experienceBlocked, router]);

	if (bill.isLoading || bill.data?.status === "open" || experienceBlocked) {
		return <GuestLoading message="Opening your bill…" />;
	}
	if (bill.error?.data?.code === "UNAUTHORIZED") return <NoGuestSession />;
	if (bill.error || !bill.data) {
		return (
			<GuestError
				message="We couldn't load your bill."
				onRetry={() => bill.refetch()}
			/>
		);
	}

	const data = bill.data;
	const isCounter = data.dailyToken != null;
	const showOrderMore =
		isCounter && (data.status === "requested" || data.status === "settled");
	const showPastBills = data.otherBills.length > 0;

	return (
		<div className="min-h-dvh bg-background text-primary">
			<GuestPageHeader
				restaurantName={data.restaurant.name}
				tableLabel={isCounter ? null : data.tableLabel}
			/>
			<main
				className={`px-5 pt-4 ${showPastBills || showOrderMore ? "pb-24" : "pb-16"}`}
			>
				{isCounter ? (
					<p className="text-secondary text-sm">
						Please show this token at the counter to complete your payment.
					</p>
				) : (
					<button
						type="button"
						onClick={() => router.push("/guest/orders")}
						className="-my-3 flex items-center gap-1 py-3 text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
					>
						<ArrowLeft
							className="icon-sm"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
						Orders
					</button>
				)}

				{data.dailyToken != null ? (
					<div className="mx-auto mt-6 max-w-md rounded-xl border border-divider bg-surface py-5 text-center">
						<p className="text-caps text-muted">Token</p>
						<p className="mt-1 font-semibold text-5xl text-accent tabular-nums">
							{data.dailyToken}
						</p>
					</div>
				) : null}

				<GuestBillReceipt
					restaurant={data.restaurant}
					billNumber={data.billNumber}
					tableLabel={data.tableLabel}
					status={data.status}
					lines={data.lines}
					subtotal={data.subtotal}
					taxSlabs={data.taxSlabs}
					total={data.total}
				/>

				{showOrderStatus ? (
					<div className="mx-auto mt-6 flex max-w-md flex-col gap-6">
						{counterOrderGroups(orders.data ?? []).map((group) => (
							<OrderGroupCard
								key={group.key}
								group={group}
								onSend={(itemIds, key) => {
									setSendingKey(key);
									releaseItem.mutate({ orderItemIds: itemIds });
								}}
								sendingKey={sendingKey}
							/>
						))}
					</div>
				) : null}
			</main>

			{showPastBills || showOrderMore ? (
				<div className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-divider border-t bg-surface-elevated px-5 py-4">
					<div
						className={`flex items-center gap-4 ${showOrderMore ? "" : "justify-center"}`}
					>
						{showPastBills ? (
							<button
								type="button"
								onClick={() => router.push("/guest/past-bills")}
								className="-my-3 py-3 font-semibold text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
							>
								Past Bills ({data.otherBills.length})
							</button>
						) : null}
						{/* Counter: submit_order() never blocks ordering again, before or
						after settle (a new round just draws a fresh bill on the same
						session) — this is plain navigation back to the menu either way,
						never a special resume/reorder flow. One button, not two: label
						only changes with whether this round has been paid yet. */}
						{showOrderMore ? (
							<button
								type="button"
								onClick={() => router.push("/guest/menu")}
								className="ml-auto rounded-md bg-accent px-6 py-4 font-medium text-background text-sm"
							>
								{data.status === "settled" ? "Order More" : "Add More Items"}
							</button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
