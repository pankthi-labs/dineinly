"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect } from "react";
import {
	GuestError,
	GuestLoading,
	NoGuestSession,
} from "@/components/guest-page-states";
import { formatBillAmount, titleCase } from "@/lib/format";
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
	const utils = trpc.useUtils();

	const { client, tableSessionId } = useGuestRealtime();
	useBroadcastChannel(
		client,
		tableSessionId ? `session:${tableSessionId}` : null,
		{
			"bill.status": () => utils.guest.bill.get.invalidate(),
			"order.new": () => utils.guest.bill.get.invalidate(),
			"order_item.status": () => utils.guest.bill.get.invalidate(),
		},
	);

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

	return (
		<div className="min-h-dvh bg-background text-primary">
			<main className="px-5 pt-4 pb-16">
				<button
					type="button"
					onClick={() => router.push("/guest/orders")}
					className="-my-3 flex items-center gap-1 py-3 text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
				>
					<ArrowLeft className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
					Orders
				</button>

				<div className="mx-auto mt-6 max-w-md rounded-xl border border-divider bg-surface p-5 tabular-nums">
					<header className="text-center">
						<h1 className="text-3xl">{data.restaurant.name}</h1>
						<p className="mt-2 text-secondary text-sm">
							{data.restaurant.address}, {data.restaurant.city},{" "}
							{data.restaurant.state} {data.restaurant.pincode}
						</p>
						<p className="mt-1 text-muted text-xs">
							GSTIN: {data.restaurant.gstNumber}
						</p>
						<p className="mt-1 text-caps text-muted">
							Bill #{data.billNumber}
							{data.tableLabel ? ` · Table ${data.tableLabel}` : ""}
							{data.status === "settled" ? " · Settled" : ""}
						</p>
					</header>

					<div className="mt-4 border-divider border-t border-dashed" />

					{data.lines.length === 0 ? (
						<p className="mt-6 text-center text-muted">
							No billable items yet.
						</p>
					) : (
						<>
							<table className="mt-4 w-full border-collapse">
								<thead>
									<tr>
										<th
											scope="col"
											className="pb-3 text-left text-caps text-secondary"
										>
											Item
										</th>
										<th
											scope="col"
											className="pb-3 pl-3 text-right text-caps text-secondary"
										>
											Rate
										</th>
										<th
											scope="col"
											className="pb-3 pl-3 text-right text-caps text-secondary"
										>
											Amount
										</th>
									</tr>
								</thead>
								<tbody>
									{data.lines.map((line) => (
										<tr key={`${line.name}:${line.unitPrice}`}>
											<td className="py-1.5 align-top text-base text-primary">
												<span className="mr-1 text-muted text-sm">
													{line.quantity}×
												</span>
												{titleCase(line.name)}
											</td>
											<td className="py-1.5 pl-3 text-right align-top text-secondary text-sm">
												{formatBillAmount(line.unitPrice)}
											</td>
											<td className="py-1.5 pl-3 text-right align-top text-base text-primary">
												{formatBillAmount(line.amount)}
											</td>
										</tr>
									))}
								</tbody>
							</table>

							<div className="mt-5 border-divider border-t border-dashed" />

							<dl className="mt-4 flex flex-col gap-2">
								<TotalsRow label="Subtotal" amount={data.subtotal} strong />
								{data.taxSlabs.map((slab) => (
									<Fragment key={`cgst-${slab.ratePercent}`}>
										<TotalsRow
											label={`CGST (${slab.ratePercent}%)`}
											amount={slab.cgst}
										/>
										<TotalsRow
											label={`SGST (${slab.ratePercent}%)`}
											amount={slab.sgst}
										/>
									</Fragment>
								))}
								{data.serviceChargeRatePercent > 0 ? (
									<TotalsRow
										label={`Service Charge (${data.serviceChargeRatePercent}%)`}
										amount={data.serviceCharge}
									/>
								) : null}
							</dl>

							<div className="mt-4 border-divider border-t" />

							<div className="mt-4 flex items-baseline justify-between">
								<span className="text-xl">Grand Total</span>
								<span className="text-2xl text-accent">
									{formatBillAmount(data.total)}
								</span>
							</div>
						</>
					)}
				</div>
			</main>
		</div>
	);
}

function TotalsRow({
	label,
	amount,
	strong,
}: {
	label: string;
	amount: number;
	strong?: boolean;
}) {
	return (
		<div
			className={`flex items-baseline justify-between ${strong ? "text-base" : "text-sm"}`}
		>
			<dt className={strong ? "font-medium text-primary" : "text-secondary"}>
				{label}
			</dt>
			<dd className={strong ? "font-medium text-primary" : "text-primary"}>
				{formatBillAmount(amount)}
			</dd>
		</div>
	);
}
