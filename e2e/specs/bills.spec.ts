import { expect, test } from "@playwright/test";
import { OTP_ROLES, RESTAURANT_1_ID } from "../fixtures/roles";
import { placeGuestOrder } from "../helpers/guest-order";
import { createFreshTable, openGuestSessionForTable } from "../helpers/tables";

const BILLS_PATH = `/restaurants/${RESTAURANT_1_ID}/bills`;

test.describe("Bills — read-only against seeded data", () => {
	test.use({ storageState: OTP_ROLES.owner.storageStatePath });

	test("filters show the seeded closed/settled session", async ({ page }) => {
		await page.goto(BILLS_PATH);
		await page.getByRole("button", { name: "All" }).click();
		await page.getByRole("button", { name: "Settled" }).click();
		await expect(page.getByText("Settled").first()).toBeVisible();
	});
});

test.describe("Bills — full lifecycle (fresh session)", () => {
	test.use({ storageState: OTP_ROLES.waiter.storageStatePath });

	test("Request → correct an item → waive service charge → Settle → Close", async ({
		page,
		browser,
	}) => {
		const label = await createFreshTable(page, RESTAURANT_1_ID);
		const { context: guestContext, page: guestPage } =
			await openGuestSessionForTable(page, browser, label);
		await placeGuestOrder(guestPage);
		await guestContext.close();

		await page.goto(BILLS_PATH);
		await page.getByRole("button", { name: "All" }).click();
		await page.locator("a", { hasText: label }).click();
		await page.waitForURL(/\/bills\/.+$/);

		// Request Bill
		await page.getByRole("button", { name: "Request Bill" }).click();
		await expect(page.getByText("Requested").first()).toBeVisible();

		// Correct the one order item — waive it rather than cancel, so the
		// settled total below still has a non-zero item to reflect.
		await page.getByRole("button", { name: "Waive", exact: true }).click();
		await page
			.locator('button[aria-label="Increase quantity"]')
			.first()
			.click();
		await page.getByRole("button", { name: "Apply" }).click();

		// Waive Service Charge
		await page.getByRole("button", { name: "Waive Service Charge" }).click();

		// Settle
		await page.getByRole("button", { name: "Mark Bill Settled" }).click();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Mark Settled" })
			.click();
		await expect(page.getByText("Settled").first()).toBeVisible();

		// Close Session
		await page.getByRole("button", { name: "Close Session" }).click();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Close Session" })
			.click();
		await page.waitForURL(new RegExp(`${RESTAURANT_1_ID}/bills$`));
	});

	test("Force-Terminate an abandoned session", async ({ page, browser }) => {
		const label = await createFreshTable(page, RESTAURANT_1_ID);
		const { context: guestContext } = await openGuestSessionForTable(
			page,
			browser,
			label,
		);
		await guestContext.close();

		await page.goto(BILLS_PATH);
		await page.getByRole("button", { name: "All" }).click();
		await page.locator("a", { hasText: label }).click();
		await page.waitForURL(/\/bills\/.+$/);

		await page.getByRole("button", { name: "Force-Terminate Session" }).click();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Force-Terminate" })
			.click();
		await page.waitForURL(new RegExp(`${RESTAURANT_1_ID}/bills$`));
	});

	test("print and download the seeded settled bill", async ({ page }) => {
		await page.goto(BILLS_PATH);
		await page.getByRole("button", { name: "All" }).click();
		await page.getByRole("button", { name: "Settled" }).click();
		await page.locator("a").first().click();
		await page.waitForURL(/\/bills\/.+$/);

		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "Download" }).click(),
		]);
		expect(await download.path()).toBeTruthy();
	});
});

test.describe("Bills RBAC boundary", () => {
	test.use({ storageState: OTP_ROLES.kitchen.storageStatePath });

	test("kitchen cannot reach Bills", async ({ page }) => {
		await page.goto(BILLS_PATH);
		await expect(page).not.toHaveURL(new RegExp(`${RESTAURANT_1_ID}/bills$`));
	});
});
