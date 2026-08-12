export function guestTableUrl(origin: string, qrToken: string): string {
	return `${origin}/qr/${qrToken}`;
}
