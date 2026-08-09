/** Display-only normalization — storage keeps whatever the user typed. */
export function titleCase(value: string): string {
	return value.toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

export function formatPrice(price: number): string {
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		maximumFractionDigits: 0,
	}).format(price);
}
