"use client";

import { ArrowLeft, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GuestPageHeader } from "@/components/guest-page-header";
import {
	GuestError,
	GuestLoading,
	NoGuestSession,
} from "@/components/guest-page-states";
import { formatBillAmount, titleCase } from "@/lib/format";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { useGuestRealtime } from "@/lib/realtime/use-guest-realtime";
import { trpc } from "@/lib/trpc-client";

type GuestOrder = {
	id: string;
	number: number;
	status: "preparing" | "partially served" | "served";
	items: { name: string; quantity: number; served: boolean; ready: boolean }[];
};

// A "partially served" order renders as two group rows sharing the order
// number — one still Preparing, one already Served — merging back into a
// single row once every item is served (docs/product.md: guest sees the
// derived order status, never per-item granularity, so status lives on the
// group, not the line).
type OrderGroup = {
	key: string;
	number: number;
	status: "preparing" | "done";
	items: { name: string; quantity: number }[];
};

const GROUP_LABEL: Record<
	"one" | "counter",
	Record<OrderGroup["status"], string>
> = {
	one: { preparing: "Preparing", done: "Served" },
	counter: { preparing: "Preparing", done: "Ready for Pickup" },
};

// Same semantic pairing as the staff Kitchen Display (preparing = Amber,
// ready/served = Green) so the two colors mean the same thing on both sides
// of the pass (docs/design-system.md §06).
const GROUP_DOT_CLASS: Record<OrderGroup["status"], string> = {
	preparing: "bg-warning",
	done: "bg-success",
};

const GROUP_TEXT_CLASS: Record<OrderGroup["status"], string> = {
	preparing: "text-warning",
	done: "text-success",
};

function orderGroups(order: GuestOrder, isCounter: boolean): OrderGroup[] {
	const isDone = (item: GuestOrder["items"][number]) =>
		isCounter ? item.served || item.ready : item.served;
	const preparing = order.items.filter((item) => !isDone(item));
	const done = order.items.filter((item) => isDone(item));
	const groups: OrderGroup[] = [];
	if (preparing.length > 0) {
		groups.push({
			key: `${order.id}-preparing`,
			number: order.number,
			status: "preparing",
			items: preparing,
		});
	}
	if (done.length > 0) {
		groups.push({
			key: `${order.id}-done`,
			number: order.number,
			status: "done",
			items: done,
		});
	}
	return groups;
}

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

	useEffect(() => {
		if (menu.isSuccess && !ordersEnabled) {
			router.replace("/guest/menu");
		}
	}, [menu.isSuccess, ordersEnabled, router]);

	const requestBillMutation = trpc.guest.bill.request.useMutation({
		onSuccess: async () => {
			await utils.guest.bill.get.invalidate();
			router.push("/guest/bill");
		},
	});

	const { client, tableSessionId } = useGuestRealtime();
	useBroadcastChannel(
		client,
		tableSessionId ? `session:${tableSessionId}` : null,
		{
			"order.new": () => {
				utils.guest.orders.list.invalidate();
				utils.guest.bill.get.invalidate();
			},
			"order_item.status": () => {
				utils.guest.orders.list.invalidate();
				utils.guest.bill.get.invalidate();
			},
			"bill.status": () => utils.guest.bill.get.invalidate(),
		},
	);

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
	const isCounter = menu.data.restaurant.experience === "counter";

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
				) : billEnabled ? (
					<div className="mt-6 flex flex-col gap-6">
						{items
							.flatMap((order) => orderGroups(order, isCounter))
							.map((group) => (
								<OrderGroupCard
									key={group.key}
									group={group}
									experience={isCounter ? "counter" : "one"}
								/>
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

// Guest experience's order history — no status ladder, since nobody in
// Dineinly ever advances an item's status for this tier (docs/product.md §
// Dineinly Experiences), so a "Preparing"/"Served" split would just be wrong.
function GuestOrderCard({ order }: { order: GuestOrder }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className="border-divider border-b pb-6">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				aria-expanded={expanded}
				className="-my-2 flex w-full items-center justify-between gap-4 py-2 text-left"
			>
				<h3 className="text-lg text-primary">
					Order {order.number} · {order.items.length}{" "}
					{order.items.length === 1 ? "item" : "items"}
				</h3>
				<ChevronDown
					className={`icon-sm shrink-0 text-secondary transition-transform duration-(--duration-base) ease-out ${expanded ? "rotate-180" : ""}`}
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			</button>

			{expanded ? (
				<div className="mt-4 flex flex-col gap-3 border-divider border-t pt-4">
					{order.items.map((item, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: no stable id — list is never reordered/edited
							key={index}
							className="text-base text-primary"
						>
							{item.quantity}x {titleCase(item.name)}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

function OrderGroupCard({
	group,
	experience,
}: {
	group: OrderGroup;
	experience: "one" | "counter";
}) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className="border-divider border-b pb-6">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				aria-expanded={expanded}
				className="-my-2 flex w-full items-center justify-between gap-4 py-2 text-left"
			>
				<h3 className="text-lg text-primary">
					Order {group.number} · {group.items.length}{" "}
					{group.items.length === 1 ? "item" : "items"}
				</h3>
				<ChevronDown
					className={`icon-sm shrink-0 text-secondary transition-transform duration-(--duration-base) ease-out ${expanded ? "rotate-180" : ""}`}
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			</button>
			<p className="flex items-center gap-2">
				<span
					aria-hidden="true"
					className={`h-2 w-2 shrink-0 rounded-full ${GROUP_DOT_CLASS[group.status]}`}
				/>
				<span className={`text-caps ${GROUP_TEXT_CLASS[group.status]}`}>
					{GROUP_LABEL[experience][group.status]}
				</span>
			</p>

			{expanded ? (
				<div className="mt-4 flex flex-col gap-3 border-divider border-t pt-4">
					{group.items.map((item, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: no stable id — list is never reordered/edited
							key={index}
							className="text-base text-primary"
						>
							{item.quantity}x {titleCase(item.name)}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}
