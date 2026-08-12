import { describe, expect, it } from "vitest";
import {
	createTableInput,
	downloadAllTableQrPdfInput,
	downloadTableQrPdfInput,
	setTableStatusInput,
	tableFieldsSchema,
} from "@/server/routers/tables.schema";

const restaurantId = "5b1e6f2e-7f3a-4b8e-9c1a-2d4e6f8a0b1c";
const tableId = "9c1a2d4e-6f8a-4b1c-9b1e-6f2e7f3a4b8e";

describe("tableFieldsSchema", () => {
	it("accepts a valid label", () => {
		expect(tableFieldsSchema.safeParse({ label: "Patio 4" }).success).toBe(
			true,
		);
	});

	it("trims the label", () => {
		const result = tableFieldsSchema.safeParse({ label: "  Patio 4  " });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.label).toBe("Patio 4");
		}
	});

	it("rejects an empty label", () => {
		expect(tableFieldsSchema.safeParse({ label: "" }).success).toBe(false);
	});

	it("rejects a label over 40 characters", () => {
		expect(tableFieldsSchema.safeParse({ label: "P".repeat(41) }).success).toBe(
			false,
		);
	});
});

describe("createTableInput", () => {
	it("requires a restaurantId alongside the label", () => {
		expect(createTableInput.safeParse({ label: "Patio 4" }).success).toBe(
			false,
		);
		expect(
			createTableInput.safeParse({ label: "Patio 4", restaurantId }).success,
		).toBe(true);
	});

	it("rejects a non-UUID restaurantId", () => {
		expect(
			createTableInput.safeParse({ label: "Patio 4", restaurantId: "abc" })
				.success,
		).toBe(false);
	});
});

describe("setTableStatusInput", () => {
	it("accepts active and archived", () => {
		expect(
			setTableStatusInput.safeParse({ id: tableId, status: "active" }).success,
		).toBe(true);
		expect(
			setTableStatusInput.safeParse({ id: tableId, status: "archived" })
				.success,
		).toBe(true);
	});

	it("rejects any other status value", () => {
		expect(
			setTableStatusInput.safeParse({ id: tableId, status: "paused" }).success,
		).toBe(false);
	});
});

describe("downloadTableQrPdfInput", () => {
	it("requires origin to be a URL", () => {
		expect(
			downloadTableQrPdfInput.safeParse({
				id: tableId,
				origin: "not-a-url",
			}).success,
		).toBe(false);
		expect(
			downloadTableQrPdfInput.safeParse({
				id: tableId,
				origin: "https://app.dineinly.com",
			}).success,
		).toBe(true);
	});
});

describe("downloadAllTableQrPdfInput", () => {
	it("requires a restaurantId and a URL origin", () => {
		expect(
			downloadAllTableQrPdfInput.safeParse({
				restaurantId,
				origin: "https://app.dineinly.com",
			}).success,
		).toBe(true);
		expect(
			downloadAllTableQrPdfInput.safeParse({
				restaurantId: "abc",
				origin: "https://app.dineinly.com",
			}).success,
		).toBe(false);
	});
});
