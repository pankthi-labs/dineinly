import { describe, expect, it } from "vitest";
import { resolveSignInInput } from "@/server/routers/auth.schema";

describe("resolveSignInInput", () => {
	it("accepts a valid email", () => {
		expect(
			resolveSignInInput.safeParse({ email: "owner@dineinly.test" }).success,
		).toBe(true);
	});

	it("lowercases and trims the email so it matches staff.email at lookup time", () => {
		const result = resolveSignInInput.safeParse({
			email: "  Owner@Dineinly.test  ",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.email).toBe("owner@dineinly.test");
		}
	});

	it("rejects an invalid email", () => {
		expect(
			resolveSignInInput.safeParse({ email: "not-an-email" }).success,
		).toBe(false);
	});
});
