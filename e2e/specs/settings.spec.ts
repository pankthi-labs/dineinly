import { expect, test } from "@playwright/test";
import { OTP_ROLES, RESTAURANT_1_ID } from "../fixtures/roles";

const SETTINGS_PATH = `/restaurants/${RESTAURANT_1_ID}/settings`;
const ORIGINAL_ADDRESS = "12 MG Road, Indiranagar"; // supabase/seed.sql

test.describe("Venue Settings", () => {
	test.use({ storageState: OTP_ROLES.owner.storageStatePath });

	test("loads current fields, edits and restores one, persists across reload", async ({
		page,
	}) => {
		await page.goto(SETTINGS_PATH);
		await expect(page.getByLabel("Address")).toHaveValue(ORIGINAL_ADDRESS);

		const tempAddress = "1 E2E Test Lane, Indiranagar";
		await page.getByLabel("Address").fill(tempAddress);
		await page.getByRole("button", { name: "Save Changes" }).click();

		await page.reload();
		await expect(page.getByLabel("Address")).toHaveValue(tempAddress);

		// Restore — Restaurant 1 is a shared fixture other specs display.
		await page.getByLabel("Address").fill(ORIGINAL_ADDRESS);
		await page.getByRole("button", { name: "Save Changes" }).click();
		await page.reload();
		await expect(page.getByLabel("Address")).toHaveValue(ORIGINAL_ADDRESS);
	});
});

test.describe("Venue Settings RBAC boundary", () => {
	for (const role of ["manager", "waiter", "kitchen"] as const) {
		test(`${role} cannot reach Venue Settings`, async ({ browser }) => {
			const context = await browser.newContext({
				storageState: OTP_ROLES[role].storageStatePath,
			});
			const page = await context.newPage();
			await page.goto(SETTINGS_PATH);
			await expect(page).not.toHaveURL(
				new RegExp(`${RESTAURANT_1_ID}/settings$`),
			);
			await context.close();
		});
	}
});
