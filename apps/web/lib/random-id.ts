// crypto.randomUUID() requires a secure context (HTTPS or localhost) — it
// throws in plain HTTP contexts (e.g. scanning a QR against a LAN dev
// server), unlike crypto.getRandomValues(), which has no such restriction.
// Used for idempotency keys (docs/architecture.md § Authorization &
// Idempotency), which only need to be unique, not unpredictable, so this
// fallback is exactly as fit for purpose as randomUUID() itself.
export function randomId(): string {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

	const bytes = Array.from(crypto.getRandomValues(new Uint8Array(16)));
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
	const hex = bytes.map((b) => b.toString(16).padStart(2, "0"));
	return [
		hex.slice(0, 4).join(""),
		hex.slice(4, 6).join(""),
		hex.slice(6, 8).join(""),
		hex.slice(8, 10).join(""),
		hex.slice(10, 16).join(""),
	].join("-");
}
