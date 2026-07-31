import { describe, expect, it, vi } from "vitest";

// Separate file from guest-token.test.ts: this test needs a
// GUEST_JWT_SIGNING_KEY value other than the throwaway keypair
// vitest.setup.ts provides, and guest-token.ts parses that value at
// module scope — a fresh import is what exercises a bad value.
describe("guest-token: malformed signing key", () => {
	it("throws at import time instead of making every token silently invalid", async () => {
		vi.resetModules();
		process.env.GUEST_JWT_SIGNING_KEY = "not-valid-json";

		await expect(import("@/lib/guest-token")).rejects.toThrow();
	});
});
