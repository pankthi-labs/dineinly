import { PoweredByDineinly } from "@/components/brand-logo";

// Restaurant name + table label, shared by the cart and orders pages (the
// menu page's header additionally hosts search/category chrome, so it stays
// bespoke — but the table label chip matches this one for a consistent
// treatment of the same data across all three guest pages).
export function GuestPageHeader({
	restaurantName,
	tableLabel,
}: {
	restaurantName: string;
	tableLabel: string;
}) {
	return (
		<header className="flex items-center gap-4 px-5 pt-6 pb-4">
			<div className="min-w-0 flex-1">
				<h1 className="text-2xl">{restaurantName}</h1>
				<PoweredByDineinly className="mt-1" />
			</div>
			<p className="shrink-0 rounded-pill border border-divider px-3 py-1 text-caps text-secondary">
				Table {tableLabel}
			</p>
		</header>
	);
}
