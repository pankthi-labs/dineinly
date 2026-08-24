import type { StaffRole } from "@/lib/auth";

/** Display-only normalization — storage keeps whatever the user typed. */
export function titleCase(value: string): string {
	return value.toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

/** Sentence case for free-text like a dish description — only the first
 * letter changes, unlike titleCase's every-word capitalization. Display-only,
 * storage keeps whatever the user typed. */
export function capitalizeFirst(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export const ROLE_LABEL: Record<StaffRole, string> = {
	waiter: "Waiter",
	kitchen: "Kitchen Staff",
	manager: "Manager",
	owner: "Owner",
};

export function formatPrice(price: number): string {
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		maximumFractionDigits: 0,
	}).format(price);
}

/** Bill line items and totals keep paisa precision, unlike menu prices. */
export function formatBillAmount(amount: number): string {
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
}

/** Counter sessions have no table — `tableLabel` is `""`, never `null`. */
export function formatBillLocation(tableLabel: string): string {
	return tableLabel ? `Table ${tableLabel}` : "Counter";
}
