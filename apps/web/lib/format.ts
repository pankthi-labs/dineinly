/** Display-only normalization — storage keeps whatever the user typed. */
export function titleCase(value: string): string {
	return value.toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}
