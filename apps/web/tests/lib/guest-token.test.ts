import { afterEach, describe, expect, it, vi } from "vitest";
import { mintGuestToken, verifyGuestToken } from "@/lib/guest-token";

// Real DB rows use gen_random_uuid() (v4). Seed fixture placeholders
// (docs: "10000000-...-000000000001" scheme) are deliberately not
// RFC4122-valid, so use proper v4-shaped ids here to match production.
const claims = {
	restaurant_id: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
	table_session_id: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
	table_label: "12",
	app_role: "guest" as const,
};

afterEach(() => {
	vi.useRealTimers();
});

describe("guest-token", () => {
	it("round-trips: mint then verify returns the same claims", async () => {
		const token = await mintGuestToken(claims);
		const verified = await verifyGuestToken(token);
		expect(verified).toEqual(claims);
	});

	it("rejects a token past its expiry", async () => {
		const token = await mintGuestToken(claims);

		vi.useFakeTimers();
		vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000); // past the 12h TTL

		expect(await verifyGuestToken(token)).toBeNull();
	});

	it("rejects a tampered signature", async () => {
		const token = await mintGuestToken(claims);
		const parts = token.split(".");
		const tamperedSignature = parts[2]?.split("").reverse().join("");
		const tampered = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

		expect(await verifyGuestToken(tampered)).toBeNull();
	});

	it("rejects garbage input", async () => {
		expect(await verifyGuestToken("not.a.jwt")).toBeNull();
	});
});
