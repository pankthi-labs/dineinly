import { describe, expect, it } from "vitest";
import {
	redeemPairingCodeInput,
	verifyPinInput,
} from "@/server/routers/station.schema";

describe("station.schema", () => {
	it("accepts an 8-digit pairing code", () => {
		expect(redeemPairingCodeInput.parse({ code: "12345678" })).toEqual({
			code: "12345678",
		});
	});

	it("rejects a pairing code that isn't 8 digits", () => {
		expect(() => redeemPairingCodeInput.parse({ code: "1234567" })).toThrow();
	});

	it("accepts a 4-to-6-digit PIN", () => {
		expect(
			verifyPinInput.parse({
				restaurantId: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
				pin: "4242",
			}),
		).toEqual({
			restaurantId: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
			pin: "4242",
		});
	});

	it("rejects a non-numeric PIN", () => {
		expect(() =>
			verifyPinInput.parse({
				restaurantId: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
				pin: "abcd",
			}),
		).toThrow();
	});
});
