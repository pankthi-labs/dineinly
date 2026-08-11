"use client";

import { ArrowLeft, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuestPageHeader } from "@/components/guest-page-header";
import {
	GuestError,
	GuestLoading,
	NoGuestSession,
} from "@/components/guest-page-states";
import { titleCase } from "@/lib/format";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { useGuestRealtime } from "@/lib/realtime/use-guest-realtime";
import { trpc } from "@/lib/trpc-client";

type GuestOrder = {
	id: string;
	number: number;
	status: "preparing" | "partially served" | "served";
	items: { name: string; quantity: number; served: boolean }[];
};

// A "partially served" order renders as two group rows sharing the order
// number — one still Preparing, one already Served — merging back into a
// single row once every item is served (docs/product.md: guest sees the
// derived order status, never per-item granularity, so status lives on the
// group, not the line).
type OrderGroup = {
	key: string;
	number: number;
	status: "preparing" | "served";
	items: { name: string; quantity: number }[];
};

const GROUP_LABEL: Record<OrderGroup["status"], string> = {
	preparing: "Preparing",
	served: "Served",
};

// Same semantic pairing as the staff Kitchen Display (preparing = Amber,
// ready/served = Green) so the two colors mean the same thing on both sides
// of the pass (docs/design-system.md §06).
const GROUP_DOT_CLASS: Record<OrderGroup["status"], string> = {
	preparing: "bg-warning",
	served: "bg-success",
};

const GROUP_TEXT_CLASS: Record<OrderGroup["status"], string> = {
	preparing: "text-warning",
	served: "text-success",
};

function orderGroups(order: GuestOrder): OrderGroup[] {
	const preparing = order.items.filter((item) => !item.served);
	const served = order.items.filter((item) => item.served);
	const groups: OrderGroup[] = [];
	if (preparing.length > 0) {
		groups.push({
			key: `${order.id}-preparing`,
			number: order.number,
			status: "preparing",
			items: preparing,
		});
	}
	if (served.length > 0) {
		groups.push({
			key: `${order.id}-served`,
			number: order.number,
			status: "served",
			items: served,
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
	const orders = trpc.guest.orders.list.useQuery(undefined, {
		enabled: menu.isSuccess,
	});
	const utils = trpc.useUtils();

	const { client, tableSessionId } = useGuestRealtime();
	useBroadcastChannel(
		client,
		tableSessionId ? `session:${tableSessionId}` : null,
		{
			"order.new": () => utils.guest.orders.list.invalidate(),
			"order_item.status": () => utils.guest.orders.list.invalidate(),
		},
	);

	if (menu.isLoading || (menu.isSuccess && orders.isLoading)) {
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
					className="flex items-center gap-1 text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
				>
					<ArrowLeft className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
					Menu
				</button>
				<h2 className="mt-4 text-caps text-secondary">My Orders</h2>

				{items.length === 0 ? (
					<p className="mt-8 text-center text-muted">
						You haven't placed an order yet.
					</p>
				) : (
					<div className="mt-6 flex flex-col gap-6">
						{items.flatMap(orderGroups).map((group) => (
							<OrderGroupCard key={group.key} group={group} />
						))}
					</div>
				)}

				{items.length > 0 ? (
					<button
						type="button"
						onClick={() => router.push("/guest/bill")}
						className="mt-8 w-full rounded-md bg-accent px-6 py-4 font-medium text-background text-sm"
					>
						View Bill
					</button>
				) : null}
			</main>
		</div>
	);
}

function OrderGroupCard({ group }: { group: OrderGroup }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className="border-divider border-b pb-6">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				aria-expanded={expanded}
				className="flex w-full items-center justify-between gap-4 text-left"
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
					{GROUP_LABEL[group.status]}
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
