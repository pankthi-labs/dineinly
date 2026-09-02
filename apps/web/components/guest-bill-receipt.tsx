import { Fragment } from "react";
import { formatBillAmount, titleCase } from "@/lib/format";

type BillLine = {
	name: string;
	unitPrice: number;
	quantity: number;
	amount: number;
	modifiers: string | null;
};

type TaxSlab = {
	ratePercent: number;
	cgst: number;
	sgst: number;
};

// The itemized receipt card — shared by the current-round bill screen
// (app/guest/bill/page.tsx) and a past round's own receipt
// (app/guest/past-bills/page.tsx), since both render the exact same
// restaurant header, line table, and totals block for whichever bill they're
// handed.
export function GuestBillReceipt({
	restaurant,
	billNumber,
	tableLabel,
	status,
	lines,
	subtotal,
	taxSlabs,
	total,
}: {
	restaurant: {
		name: string;
		address: string;
		city: string;
		gstNumber: string;
		state: string;
		pincode: string;
	};
	billNumber: string | null;
	tableLabel: string | null;
	status: "open" | "requested" | "settled";
	lines: BillLine[];
	subtotal: number;
	taxSlabs: TaxSlab[];
	total: number;
}) {
	return (
		<div className="mx-auto mt-6 max-w-md rounded-xl border border-divider bg-surface p-5 tabular-nums">
			<header className="text-center">
				<h2 className="text-3xl">{titleCase(restaurant.name)}</h2>
				<p className="mt-2 text-secondary text-sm">
					{restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
					{restaurant.pincode}
				</p>
				<p className="mt-1 text-muted text-xs">GSTIN: {restaurant.gstNumber}</p>
				<p className="mt-1 text-caps text-muted">
					Bill #{billNumber}
					{tableLabel ? ` · Table ${tableLabel}` : ""}
					{status === "settled" ? " · Settled" : ""}
				</p>
			</header>

			<div className="mt-4 border-divider border-t border-dashed" />

			{lines.length === 0 ? (
				<p className="mt-6 text-center text-muted">No billable items yet.</p>
			) : (
				<>
					<table className="mt-4 w-full border-collapse">
						<thead>
							<tr className="border-divider border-b">
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
							{lines.map((line) => (
								<tr
									key={`${line.name}:${line.unitPrice}:${line.modifiers ?? ""}`}
									className="border-divider border-t"
								>
									<td className="py-2 align-top text-base text-primary">
										<span className="mr-1 text-muted text-sm">
											{line.quantity}×
										</span>
										{titleCase(line.name)}
										{line.modifiers ? (
											<span className="ml-1 text-muted text-sm">
												({line.modifiers})
											</span>
										) : null}
									</td>
									<td className="py-2 pl-3 text-right align-top text-secondary text-sm">
										{formatBillAmount(line.unitPrice)}
									</td>
									<td className="py-2 pl-3 text-right align-top text-base text-primary">
										{formatBillAmount(line.amount)}
									</td>
								</tr>
							))}
						</tbody>
					</table>

					<div className="mt-5 border-divider border-t border-dashed" />

					<dl className="mt-4 flex flex-col gap-2">
						<TotalsRow label="Subtotal" amount={subtotal} strong />
						{taxSlabs.map((slab) => (
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
					</dl>

					<div className="mt-4 border-divider border-t" />

					<div className="mt-4 flex items-baseline justify-between gap-4">
						<span className="text-xl">Grand Total</span>
						<span className="text-2xl text-accent">
							{formatBillAmount(total)}
						</span>
					</div>
				</>
			)}
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
