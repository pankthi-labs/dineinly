import { afterEach, describe, expect, it, vi } from "vitest";
import {
	mintStationSessionToken,
	verifyStationSessionToken,
} from "@/lib/station-session";

const claims = {
	staffId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
	restaurantId: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
};

afterEach(() => {
	vi.useRealTimers();
});

describe("station-session", () => {
	it("round-trips: mint then verify returns the same claims", async () => {
		const token = await mintStationSessionToken(claims);
		expect(await verifyStationSessionToken(token)).toEqual(claims);
	});

	it("rejects a token past its 12h expiry", async () => {
		const token = await mintStationSessionToken(claims);
		vi.useFakeTimers();
		vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
		expect(await verifyStationSessionToken(token)).toBeNull();
	});

	it("rejects a tampered signature", async () => {
		const token = await mintStationSessionToken(claims);
		const parts = token.split(".");
		const tampered = `${parts[0]}.${parts[1]}.${parts[2]?.split("").reverse().join("")}`;
		expect(await verifyStationSessionToken(tampered)).toBeNull();
	});

	it("rejects garbage input", async () => {
		expect(await verifyStationSessionToken("not.a.jwt")).toBeNull();
	});
});
