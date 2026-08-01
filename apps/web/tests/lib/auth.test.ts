import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { isDineinlyAdmin } from "@/lib/auth";

function userWithAppMetadata(appMetadata: Record<string, unknown>): User {
	return { app_metadata: appMetadata } as User;
}

describe("isDineinlyAdmin", () => {
	it("is true for the dineinly_admin claim", () => {
		expect(
			isDineinlyAdmin(userWithAppMetadata({ app_role: "dineinly_admin" })),
		).toBe(true);
	});

	it("is false for any other claim value", () => {
		expect(isDineinlyAdmin(userWithAppMetadata({ app_role: "guest" }))).toBe(
			false,
		);
	});

	it("is false when app_metadata has no app_role", () => {
		expect(isDineinlyAdmin(userWithAppMetadata({}))).toBe(false);
	});

	it("is false for a null user", () => {
		expect(isDineinlyAdmin(null)).toBe(false);
	});
});
