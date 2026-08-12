"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { Receipt } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CollapsibleSearch } from "@/components/collapsible-search";
import { PageHeader } from "@/components/page-header";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import type { AppRouter } from "@/server/routers/_app";
import { RestaurantNavHeader } from "../restaurant-nav-header";
import { BillRow } from "./bill-row";

type Bill = inferRouterOutputs<AppRouter>["bills"]["list"][number];
type QuickRange = "today" | "yesterday" | "last3days" | "all";
type StatusFilter = "all" | "open" | "requested" | "settled";

const QUICK_RANGES: { value: QuickRange; label: string }[] = [
	{ value: "today", label: "Today" },
	{ value: "yesterday", label: "Yesterday" },
	{ value: "last3days", label: "Last 3 Days" },
	{ value: "all", label: "All" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
	{ value: "requested", label: "Requested" },
	{ value: "settled", label: "Settled" },
];

export default function BillsPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const [search, setSearch] = useState("");
	const [quickRange, setQuickRange] = useState<QuickRange>("today");
	const [exactDate, setExactDate] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const listQuery = trpc.bills.list.useQuery({
		restaurantId,
		quickRange,
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
	});

	function selectQuickRange(value: QuickRange) {
		setQuickRange(value);
		setExactDate("");
	}

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
					search={
						<CollapsibleSearch
							value={search}
							onChange={setSearch}
							label="Search by bill number or table"
						/>
					}
					title="Bills"
					description="Generate, correct, settle, and close bills for every table."
				/>

				<div className="mt-8 flex flex-wrap items-center gap-3">
					<div className="flex flex-wrap items-center gap-2">
						{QUICK_RANGES.map((range) => (
							<button
								key={range.value}
								type="button"
								onClick={() => selectQuickRange(range.value)}
								aria-pressed={!exactDate && quickRange === range.value}
								className={`rounded-pill border px-4 py-2 font-medium text-sm transition-colors duration-(--duration-base) ease-out ${
									!exactDate && quickRange === range.value
										? "border-accent text-primary"
										: "border-divider text-secondary hover:text-primary"
								}`}
							>
								{range.label}
							</button>
						))}
					</div>
					<label className="flex items-center gap-2 text-secondary text-sm">
						<span className="text-caps">Or exact date</span>
						<input
							type="date"
							value={exactDate}
							onChange={(event) => setExactDate(event.target.value)}
							className="rounded-sm border border-divider bg-surface px-3 py-2 text-primary text-sm"
						/>
					</label>
				</div>

				{bills.length === 0 ? null : (
					<div className="mt-4 flex flex-wrap items-center gap-2">
						{STATUS_FILTERS.map((filter) => (
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
				)}

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
								className="mt-4 text-accent text-caps hover:text-accent-hover"
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
								className="mt-3 text-accent text-caps hover:text-accent-hover"
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
