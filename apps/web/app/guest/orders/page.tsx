"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GuestPageHeader } from "@/components/guest-page-header";
import {
	GuestError,
	GuestLoading,
	NoGuestSession,
} from "@/components/guest-page-states";
import {
	GuestOrderCard,
	OrderGroupCard,
} from "@/components/order-status-groups";
import { formatBillAmount } from "@/lib/format";
import { orderGroups } from "@/lib/order-groups";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { useGuestRealtime } from "@/lib/realtime/use-guest-realtime";
import { trpc } from "@/lib/trpc-client";

// Order history for the current table session — reached from the guest
// menu's "My Orders" link, which only appears once the guest has placed at
// least one order (app/guest/menu/page.tsx). Same phone-only assumption and
// "no session" state as the menu/cart pages.
export default function GuestOrdersPage() {
	const router = useRouter();
	const menu = trpc.guest.menu.useQuery(undefined, { retry: false });
	// docs/product.md § Dineinly Experiences: Menu never places an order, so
	// it has no history to bounce here for. Guest and One both get an order
	// history — only One's is live-status-tracked and has a bill attached
	// (see the ordersEnabled/billEnabled split below and in guest.ts).
	const ordersEnabled = menu.data?.restaurant.experience !== "menu";
	const billEnabled =
		menu.data?.restaurant.experience === "one" ||
		menu.data?.restaurant.experience === "counter";
	const orders = trpc.guest.orders.list.useQuery(undefined, {
		enabled: menu.isSuccess && ordersEnabled,
	});
	// Live running subtotal only (no tax/service breakdown — that only
	// applies once the bill is actually requested) — read-only, same query
	// the bill screen uses, no side effect.
	const bill = trpc.guest.bill.get.useQuery(undefined, {
		enabled: menu.isSuccess && billEnabled,
	});
	const utils = trpc.useUtils();

	const isCounter = menu.data?.restaurant.experience === "counter";

	useEffect(() => {
		if (menu.isSuccess && !ordersEnabled) {
			router.replace("/guest/menu");
		}
	}, [menu.isSuccess, ordersEnabled, router]);

	// Counter: once a bill exists (Request Bill tapped), the bill screen is
	// the single source of truth for status — token, receipt, and (once
	// settled) per-item status all live there (app/guest/bill/page.tsx) — so
	// this page only ever shows the pre-request, nothing's-happening-yet view.
	useEffect(() => {
		if (isCounter && bill.data && bill.data.status !== "open") {
			router.replace("/guest/bill");
		}
	}, [isCounter, bill.data, router]);

	const requestBillMutation = trpc.guest.bill.request.useMutation({
		onSuccess: async () => {
			await utils.guest.bill.get.invalidate();
			router.push("/guest/bill");
		},
	});

	const { client, sessionId } = useGuestRealtime();
	useBroadcastChannel(client, sessionId ? `session:${sessionId}` : null, {
		"order.new": () => {
			utils.guest.orders.list.invalidate();
			utils.guest.bill.get.invalidate();
		},
		"order_item.status": () => {
			utils.guest.orders.list.invalidate();
			utils.guest.bill.get.invalidate();
		},
		"bill.status": () => utils.guest.bill.get.invalidate(),
	});

	if (
		menu.isLoading ||
		(menu.isSuccess && !ordersEnabled) ||
		(menu.isSuccess && orders.isLoading)
	) {
		return <GuestLoading message="Loading your orders…" />;
	}
	if (menu.error?.data?.code === "UNAUTHORIZED") return <NoGuestSession />;
	if (menu.error || !menu.data) {
		return (
			<GuestError
				message="We couldn't load your orders."
				onRetry={() => menu.refetch()}
			/>
		);
	}

	const items = [...(orders.data ?? [])].reverse();

	return (
		<div className="min-h-dvh bg-background text-primary">
			<GuestPageHeader
				restaurantName={menu.data.restaurant.name}
				tableLabel={menu.data.tableLabel}
			/>

			<main className="px-5 pt-4 pb-16">
				<button
					type="button"
					onClick={() => router.push("/guest/menu")}
					className="-my-3 flex items-center gap-1 py-3 text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
				>
					<ArrowLeft className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
					Menu
				</button>
				<h2 className="mt-4 text-caps text-secondary">My Orders</h2>

				{items.length === 0 ? (
					<p className="mt-8 text-center text-muted">
						You haven't placed an order yet.
					</p>
				) : billEnabled && !isCounter ? (
					<div className="mt-6 flex flex-col gap-6">
						{items
							.flatMap((order) => orderGroups(order))
							.map((group) => (
								<OrderGroupCard key={group.key} group={group} />
							))}
					</div>
				) : (
					<div className="mt-6 flex flex-col gap-6">
						{items.map((order) => (
							<GuestOrderCard key={order.id} order={order} />
						))}
					</div>
				)}

				{items.length > 0 && billEnabled && bill.data ? (
					<div className="mt-8 flex flex-col gap-4 border-divider border-t pt-6">
						<div className="flex items-baseline justify-between">
							<span className="text-secondary text-sm">Subtotal so far</span>
							<span className="text-primary text-xl tabular-nums">
								{formatBillAmount(bill.data.subtotal)}
							</span>
						</div>
						{bill.data.status === "open" ? (
							<button
								type="button"
								onClick={() => requestBillMutation.mutate()}
								disabled={requestBillMutation.isPending}
								className="w-full rounded-md bg-accent px-6 py-4 font-medium text-background text-sm disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
							>
								{requestBillMutation.isPending ? "Requesting…" : "Request Bill"}
							</button>
						) : (
							<button
								type="button"
								onClick={() => router.push("/guest/bill")}
								className="w-full rounded-md bg-accent px-6 py-4 font-medium text-background text-sm"
							>
								View Bill
							</button>
						)}
						{requestBillMutation.error ? (
							<p role="alert" className="text-error text-sm">
								{requestBillMutation.error.message}
							</p>
						) : null}
					</div>
				) : null}
			</main>
		</div>
	);
}
