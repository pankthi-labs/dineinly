"use client";

import { ArrowLeft, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GuestBillReceipt } from "@/components/guest-bill-receipt";
import { GuestPageHeader } from "@/components/guest-page-header";
import {
	GuestError,
	GuestLoading,
	NoGuestSession,
} from "@/components/guest-page-states";
import { SiteFooter } from "@/components/site-footer";
import { trpc } from "@/lib/trpc-client";

// Every earlier round of the current visit (Counter only, in practice) — the
// current round's own receipt lives on app/guest/bill/page.tsx; this page is
// only reached via that screen's "Past Bills" link, and only ever lists
// rounds already settled (guest.bill.get only ever surfaces a round here
// once a later one exists). Picking a token from the dropdown loads that
// round's own full receipt below it.
export default function GuestPastBillsPage() {
	const router = useRouter();
	const bill = trpc.guest.bill.get.useQuery(undefined, { retry: false });
	const otherBills = bill.data?.otherBills ?? [];
	const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

	// Defaults to the most recent past round once the list loads — nothing to
	// pick until then, so the dropdown can't render selected-but-empty.
	useEffect(() => {
		if (selectedBillId) return;
		const latest = otherBills.at(-1);
		if (latest) setSelectedBillId(latest.billId);
	}, [otherBills, selectedBillId]);

	const past = trpc.guest.bill.getPast.useQuery(
		{ billId: selectedBillId ?? "" },
		{ enabled: selectedBillId != null },
	);

	const experienceBlocked = bill.error?.data?.code === "FORBIDDEN";

	useEffect(() => {
		if (experienceBlocked) router.replace("/guest/menu");
	}, [experienceBlocked, router]);

	if (bill.isLoading || experienceBlocked) {
		return <GuestLoading message="Loading past bills…" />;
	}
	if (bill.error?.data?.code === "UNAUTHORIZED") return <NoGuestSession />;
	if (bill.error || !bill.data) {
		return (
			<GuestError
				message="We couldn't load your past bills."
				onRetry={() => bill.refetch()}
			/>
		);
	}

	return (
		<div className="min-h-dvh bg-background text-primary">
			<GuestPageHeader
				restaurantName={bill.data.restaurant.name}
				tableLabel={null}
			/>
			<main className="px-5 pt-4 pb-16">
				<button
					type="button"
					onClick={() => router.push("/guest/bill")}
					className="-my-3 flex items-center gap-1 py-3 text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
				>
					<ArrowLeft className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
					Bill
				</button>

				<h1 className="mt-4 text-2xl">Past Bills</h1>

				{otherBills.length === 0 ? (
					<p className="mt-8 text-center text-muted">
						No past bills yet this visit.
					</p>
				) : (
					<>
						<div className="mx-auto mt-6 max-w-md">
							<label
								htmlFor="past-bill-token"
								className="text-caps text-secondary"
							>
								Token
							</label>
							<div className="relative mt-2">
								<select
									id="past-bill-token"
									value={selectedBillId ?? ""}
									onChange={(event) => setSelectedBillId(event.target.value)}
									className="w-full appearance-none rounded-sm border border-divider bg-surface px-3 py-3 pr-10 text-base text-primary"
								>
									{otherBills.map((other) => (
										<option key={other.billId} value={other.billId}>
											{other.dailyToken != null
												? `Token ${other.dailyToken}`
												: `Bill #${other.billNumber}`}
										</option>
									))}
								</select>
								<ChevronDown
									aria-hidden="true"
									className="icon-sm pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
									strokeWidth={1.5}
								/>
							</div>
						</div>

						{past.isPending ? (
							<div className="skeleton mx-auto mt-6 h-64 max-w-md rounded-xl border border-divider" />
						) : past.error || !past.data ? (
							<p className="mt-6 text-center text-error text-sm">
								We couldn't load this bill.
							</p>
						) : (
							<GuestBillReceipt
								restaurant={past.data.restaurant}
								billNumber={past.data.billNumber}
								tableLabel={past.data.tableLabel}
								status={past.data.status}
								lines={past.data.lines}
								subtotal={past.data.subtotal}
								taxSlabs={past.data.taxSlabs}
								total={past.data.total}
							/>
						)}
					</>
				)}

				<SiteFooter variant="compact" className="mt-10" />
			</main>
		</div>
	);
}
