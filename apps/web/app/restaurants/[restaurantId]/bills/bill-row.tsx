"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { formatBillAmount, formatBillLocation } from "@/lib/format";
import type { AppRouter } from "@/server/routers/_app";

type BillListItem = inferRouterOutputs<AppRouter>["bills"]["list"][number];

const STATUS_LABEL: Record<BillListItem["status"], string> = {
	open: "Open",
	requested: "Requested",
	settled: "Settled",
};

// Open: nothing pending yet, neutral. Requested: awaiting staff settlement —
// the warning state token, the same in-flight/needs-attention role it carries
// on the kitchen queue and on an expired staff invite. Settled: Rose Copper,
// §06's "settlement confirmation / completed-step indicator" role exactly.
const STATUS_COLOR: Record<BillListItem["status"], string> = {
	open: "text-secondary",
	requested: "text-warning",
	settled: "text-accent-secondary",
};

export function BillRow({
	restaurantId,
	bill,
}: {
	restaurantId: string;
	bill: BillListItem;
}) {
	return (
		<Link
			href={`/restaurants/${restaurantId}/bills/${bill.sessionId}`}
			className="flex items-center justify-between gap-4 rounded-xl border border-divider bg-surface p-5 no-underline transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated"
		>
			<div className="flex min-w-0 flex-col gap-1">
				<span className={`text-caps ${STATUS_COLOR[bill.status]}`}>
					{STATUS_LABEL[bill.status]}
				</span>
				<div className="flex items-center gap-2">
					<h3 className="truncate text-lg text-primary">
						{bill.billNumber ? `Bill #${bill.billNumber}` : "Not yet requested"}
					</h3>
					{bill.dailyToken != null ? (
						<span className="shrink-0 rounded-pill border border-accent px-3 py-0.5 font-semibold text-accent text-sm tabular-nums">
							Token {bill.dailyToken}
						</span>
					) : null}
				</div>
				<p className="text-secondary text-sm">
					{bill.dailyToken == null
						? `${formatBillLocation(bill.tableLabel)} · `
						: ""}
					{new Date(bill.date).toLocaleString("en-IN", {
						day: "numeric",
						month: "short",
						hour: "numeric",
						minute: "2-digit",
					})}
				</p>
			</div>
			<span className="shrink-0 text-accent text-xl tabular-nums">
				{formatBillAmount(bill.total)}
			</span>
		</Link>
	);
}
