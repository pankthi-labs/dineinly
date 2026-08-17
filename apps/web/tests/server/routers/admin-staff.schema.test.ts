import { describe, expect, it } from "vitest";
import {
	adminStaffFieldsSchema,
	removeAdminStaffInput,
	updateAdminStaffInput,
} from "@/server/routers/admin-staff.schema";

const adminId = "5b1e6f2e-7f3a-4b8e-9c1a-2d4e6f8a0b1c";

describe("adminStaffFieldsSchema", () => {
	it("accepts a valid name and email", () => {
		expect(
			adminStaffFieldsSchema.safeParse({
				name: "Priya Nair",
				email: "priya@dineinly.com",
			}).success,
		).toBe(true);
	});

	it("lowercases and trims the email", () => {
		const result = adminStaffFieldsSchema.safeParse({
			name: "Priya Nair",
			email: "  Priya@Dineinly.com  ",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.email).toBe("priya@dineinly.com");
		}
	});

	it("rejects a name under 2 characters", () => {
		expect(
			adminStaffFieldsSchema.safeParse({ name: "P", email: "p@dineinly.com" })
				.success,
		).toBe(false);
	});

	it("rejects an invalid email", () => {
		expect(
			adminStaffFieldsSchema.safeParse({
				name: "Priya Nair",
				email: "not-an-email",
			}).success,
		).toBe(false);
	});
});

describe("updateAdminStaffInput", () => {
	it("requires an id and name, no email", () => {
		expect(
			updateAdminStaffInput.safeParse({ id: adminId, name: "Priya Nair" })
				.success,
		).toBe(true);
	});

	it("rejects a non-uuid id", () => {
		expect(
			updateAdminStaffInput.safeParse({ id: "not-a-uuid", name: "Priya Nair" })
				.success,
		).toBe(false);
	});
});

describe("removeAdminStaffInput", () => {
	it("accepts a valid id", () => {
		expect(removeAdminStaffInput.safeParse({ id: adminId }).success).toBe(true);
	});
});
