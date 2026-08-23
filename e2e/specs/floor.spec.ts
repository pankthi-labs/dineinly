import { expect, test } from "@playwright/test";
import {
	OTP_ROLES,
	RESTAURANT_1_ID,
	RESTAURANT_1_TABLES,
} from "../fixtures/roles";
import { createFreshTable, openGuestSessionForTable } from "../helpers/tables";

const FLOOR_PATH = `/restaurants/${RESTAURANT_1_ID}/floor`;

test.describe("Floor", () => {
	test.use({ storageState: OTP_ROLES.waiter.storageStatePath });

	test("grid shows seeded occupied and free tables", async ({ page }) => {
		await page.goto(FLOOR_PATH);
		await expect(
			page.getByText(RESTAURANT_1_TABLES.t1Occupied.label, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(RESTAURANT_1_TABLES.t3Free.label, { exact: true }),
		).toBeVisible();
	});

	test("order for guest sends an item to the kitchen", async ({
		page,
		browser,
	}) => {
		const label = await createFreshTable(page, RESTAURANT_1_ID);
		const { context: guestContext } = await openGuestSessionForTable(
			page,
			browser,
			label,
		); // occupies the table, session not otherwise needed here
		await guestContext.close();

		await page.goto(FLOOR_PATH);
		const tableCard = page.locator("div", { hasText: label }).last();
		await tableCard.getByRole("link", { name: "Order for Guest" }).click();
		await page.waitForURL(/\/floor\/.+$/);

		const itemRow = page
			.locator("div", { hasText: "Paneer Butter Masala" })
			.last();
		await itemRow.getByRole("button", { name: "Add" }).click();
		await page.getByRole("button", { name: "Send to Kitchen" }).click();
		await page.waitForURL(new RegExp(`${RESTAURANT_1_ID}/floor$`));
	});

	test("merge a free table into an occupied one", async ({ page, browser }) => {
		const occupiedLabel = await createFreshTable(page, RESTAURANT_1_ID);
		const freeLabel = await createFreshTable(page, RESTAURANT_1_ID);
		const { context: guestContext } = await openGuestSessionForTable(
			page,
			browser,
			occupiedLabel,
		);
		await guestContext.close();

		await page.goto(FLOOR_PATH);
		const occupiedCard = page.locator("div", { hasText: occupiedLabel }).last();
		await occupiedCard.getByRole("button", { name: "Merge Table" }).click();
		await page.getByLabel("Free table").selectOption({ label: freeLabel });
		await page.getByRole("button", { name: "Merge", exact: true }).click();
		await expect(page.getByText("Tables merged.")).toBeVisible();

		// The merged-in table moves out of the "Free tables" pill list (it
		// still renders elsewhere, now as its own occupied card sharing the
		// target's session — scope to the free-table pill's own class so this
		// doesn't accidentally match that occupied card instead).
		await expect(
			page.locator("span.rounded-pill", { hasText: freeLabel }),
		).toHaveCount(0);
	});

	test("individually-signed-in waiter reaches /floor with no PIN overlay", async ({
		page,
	}) => {
		await page.goto(FLOOR_PATH);
		await expect(
			page.getByRole("heading", { name: "Enter your PIN" }),
		).not.toBeVisible();
	});
});

test.describe("Floor RBAC boundary", () => {
	test.use({ storageState: OTP_ROLES.kitchen.storageStatePath });

	test("kitchen cannot reach Floor", async ({ page }) => {
		await page.goto(FLOOR_PATH);
		await expect(page).not.toHaveURL(new RegExp(`${RESTAURANT_1_ID}/floor$`));
	});
});
