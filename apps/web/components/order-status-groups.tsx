"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { titleCase } from "@/lib/format";
import {
	GROUP_DOT_CLASS,
	GROUP_TEXT_CLASS,
	type GuestOrder,
	type OrderGroup,
} from "@/lib/order-groups";

export function OrderGroupCard({ group }: { group: OrderGroup }) {
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
					{group.status === "preparing" ? "Preparing" : "Served"}
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
