"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { Receipt } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import type { AppRouter } from "@/server/routers/_app";
import { RestaurantNavHeader } from "../restaurant-nav-header";
import { BillRow } from "./bill-row";

type Bill = inferRouterOutputs<AppRouter>["bills"]["list"][number];
type StatusFilter = "all" | "open" | "requested" | "settled";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
	{ value: "requested", label: "Requested" },
	{ value: "settled", label: "Settled" },
];

export default function BillsPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const [search, setSearch] = useState("");
	const [exactDate, setExactDate] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const listQuery = trpc.bills.list.useQuery({
		restaurantId,
		date: exactDate || undefined,
	});

	// Bills tab watches every session at once, not just one — subscribes to
	// the restaurant-wide topic (bill.status now also broadcasts there, see
	// broadcast_bill_status() § 12) rather than session:{id} per row, which
	// would mean one channel per visible bill.
	const utils = trpc.useUtils();
	const supabase = createClient();
	useBroadcastChannel(supabase, `restaurant:${restaurantId}`, {
		"table_session.change": () => utils.bills.list.invalidate(),
		"bill.status": () => utils.bills.list.invalidate(),
		// A live (open/requested) row's total is computed from order_items on
		// every list read (bills.ts) — a new order or an item's status/waive
		// changing has to invalidate the same way, or the shown total goes
		// stale until something else happens to touch this session.
		"order.new": () => utils.bills.list.invalidate(),
		"order_item.status": () => utils.bills.list.invalidate(),
	});

	const bills = listQuery.data ?? [];
	const filterCounts = {
		all: bills.length,
		open: bills.filter((b) => b.status === "open").length,
		requested: bills.filter((b) => b.status === "requested").length,
		settled: bills.filter((b) => b.status === "settled").length,
	};
	const normalizedSearch = search.trim().toLowerCase();
	const visibleBills = bills
		.filter((b) => statusFilter === "all" || b.status === statusFilter)
		.filter(
			(b: Bill) =>
				!normalizedSearch ||
				b.billNumber?.toLowerCase().includes(normalizedSearch) ||
				b.tableLabel.toLowerCase().includes(normalizedSearch),
		);

	return (
		<div className="min-h-dvh bg-background text-primary">
			<RestaurantNavHeader
				restaurantId={restaurantId}
				restaurantName={restaurantQuery.data?.name ?? ""}
				active="Bills"
			/>

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<PageHeader
					search={{
						value: search,
						onChange: setSearch,
						label: "Search by bill number or table",
					}}
					title="Bills"
					description="Generate, correct, settle, and close bills for every table."
				/>

				<div className="mt-8 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => setExactDate("")}
						aria-pressed={!exactDate}
						className={`rounded-pill border px-4 py-2 font-medium text-sm transition-colors duration-(--duration-base) ease-out ${
							!exactDate
								? "border-accent text-primary"
								: "border-divider text-secondary hover:text-primary"
						}`}
					>
						Today
					</button>
					<input
						type="date"
						value={exactDate}
						onChange={(event) => setExactDate(event.target.value)}
						aria-label="Filter by exact date"
						className="rounded-sm border border-divider bg-surface px-3 py-2 text-primary text-sm"
					/>
					{bills.length === 0
						? null
						: STATUS_FILTERS.map((filter) => (
								<button
									key={filter.value}
									type="button"
									onClick={() => setStatusFilter(filter.value)}
									aria-pressed={statusFilter === filter.value}
									className={`rounded-pill border px-4 py-2 font-medium text-sm transition-colors duration-(--duration-base) ease-out ${
										statusFilter === filter.value
											? "border-accent text-primary"
											: "border-divider text-secondary hover:text-primary"
									}`}
								>
									{filter.label} ({filterCounts[filter.value]})
								</button>
							))}
				</div>

				<div className="mt-8 flex flex-col gap-3">
					{listQuery.isPending ? (
						Array.from({ length: 4 }, (_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders never reorder.
								key={i}
								className="skeleton h-24 rounded-xl border border-divider"
							/>
						))
					) : listQuery.isError ? (
						<div className="rounded-xl border border-divider bg-surface p-8 text-center">
							<p role="alert" className="text-error text-sm">
								Couldn't load bills: {listQuery.error.message}
							</p>
							<button
								type="button"
								onClick={() => listQuery.refetch()}
								className="mt-4 text-accent text-caps hover:opacity-80"
							>
								Retry
							</button>
						</div>
					) : bills.length === 0 ? (
						<div className="flex flex-col items-center gap-4 rounded-xl border border-divider bg-surface p-16 text-center">
							<Receipt
								className="icon-xl text-muted"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<p className="text-primary">No bills in this range.</p>
						</div>
					) : visibleBills.length === 0 ? (
						<div className="rounded-xl border border-divider bg-surface p-6">
							<p className="text-caps text-muted">No bills match this view.</p>
							<button
								type="button"
								onClick={() => {
									setSearch("");
									setStatusFilter("all");
								}}
								className="mt-3 text-accent text-caps hover:opacity-80"
							>
								Clear filters
							</button>
						</div>
					) : (
						visibleBills.map((bill) => (
							<BillRow
								key={bill.sessionId}
								restaurantId={restaurantId}
								bill={bill}
							/>
						))
					)}
				</div>
			</main>
		</div>
	);
}
