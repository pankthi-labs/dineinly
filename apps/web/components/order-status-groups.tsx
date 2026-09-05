"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { titleCase } from "@/lib/format";
import { describeModifiers } from "@/lib/order-item-groups";
import {
	GROUP_DOT_CLASS,
	GROUP_TEXT_CLASS,
	type GuestOrder,
	type OrderGroup,
} from "@/lib/order-groups";

export function OrderGroupCard({
	group,
	onSend,
	sendingKey,
}: {
	group: OrderGroup;
	// Counter only: present when the guest can act on this group (unsent
	// items) — omitted entirely for Full-Service's orderGroups(), which never
	// produces an "unsent" group in the first place. Takes every underlying
	// order_item id a merged line combines (apps/web/lib/order-groups.ts),
	// plus that line's own key for the caller's pending-state tracking.
	onSend?: (itemIds: string[], key: string) => void;
	sendingKey?: string | null;
}) {
	const [expanded, setExpanded] = useState(false);

	if (group.status === "unsent") {
		return (
			<div className="border-divider border-b pb-6">
				<h3 className="text-lg text-primary">
					Ready to send · {group.items.length}{" "}
					{group.items.length === 1 ? "item" : "items"}
				</h3>
				<div className="mt-4 flex flex-col gap-3">
					{group.items.map((item) => (
						<div
							key={item.key}
							className="flex items-center justify-between gap-4"
						>
							<span className="text-base text-primary">
								<span className="mr-1 text-muted text-sm">
									{item.quantity}x
								</span>
								{titleCase(item.name)}
								{item.modifiers ? (
									<span className="ml-1 text-muted text-sm">
										({item.modifiers})
									</span>
								) : null}
							</span>
							<button
								type="button"
								onClick={() => onSend?.(item.ids, item.key)}
								disabled={sendingKey === item.key}
								className="shrink-0 rounded-md border border-divider px-4 py-3 text-caps text-secondary transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
							>
								{sendingKey === item.key ? "Sending…" : "Send to Kitchen"}
							</button>
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="border-divider border-b pb-6">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				aria-expanded={expanded}
				className="-my-2 flex w-full items-center justify-between gap-4 py-2 text-left"
			>
				<h3 className="text-lg text-primary">
					{group.number !== null ? `Order ${group.number} · ` : ""}
					{group.items.length} {group.items.length === 1 ? "item" : "items"}
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
					{group.status === "preparing"
						? "Preparing"
						: group.status === "ready"
							? "Ready for Pickup"
							: group.number === null
								? "Picked Up"
								: "Served"}
				</span>
			</p>

			{expanded ? (
				<div className="mt-4 flex flex-col gap-3 border-divider border-t pt-4">
					{group.items.map((item) => (
						<span key={item.key} className="text-base text-primary">
							{item.quantity}x {titleCase(item.name)}
							{item.modifiers ? (
								<span className="ml-1 text-muted text-sm">
									({item.modifiers})
								</span>
							) : null}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

// Guest experience's order history — no status ladder, since nobody in
// Dineinly ever advances an item's status for this tier (docs/product.md §
// Dineinly Experiences), so a "Preparing"/"Served" split would just be
// wrong. Also Counter's pre-settlement view: nothing has started preparing
// yet, so the same flat list applies until a bill is requested.
export function GuestOrderCard({ order }: { order: GuestOrder }) {
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
					{order.items.map((item) => (
						<div key={item.id} className="text-base text-primary">
							<p>
								{item.quantity}x {titleCase(item.name)}
							</p>
							{describeModifiers(item.spice, item.salt, item.ice) ? (
								<p className="mt-1 text-muted text-sm">
									{describeModifiers(item.spice, item.salt, item.ice)}
								</p>
							) : null}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
