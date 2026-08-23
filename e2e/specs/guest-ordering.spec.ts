import { expect, test } from "@playwright/test";
import { OTP_ROLES, RESTAURANT_1_ID } from "../fixtures/roles";
import { placeGuestOrder } from "../helpers/guest-order";
import { createFreshTable, openGuestSessionForTable } from "../helpers/tables";

test.use({ storageState: OTP_ROLES.owner.storageStatePath });

test.describe("Guest ordering", () => {
	test("QR scan, browse, add to cart, confirm order, view orders", async ({
		page,
		browser,
	}) => {
		const label = await createFreshTable(page, RESTAURANT_1_ID);
		const { context: guestContext, page: guestPage } =
			await openGuestSessionForTable(page, browser, label);

		await expect(guestPage).toHaveURL(/\/guest\/menu$/);
		// CollapsibleSearch swaps a trigger button for the input on open — both
		// share the same accessible name (components/collapsible-search.tsx).
		await guestPage.getByRole("button", { name: "Search dishes" }).click();
		await guestPage.getByLabel("Search dishes").fill("Paneer");
		await expect(guestPage.getByText("Paneer Butter Masala")).toBeVisible();
		await guestPage.getByLabel("Search dishes").fill("");

		await placeGuestOrder(guestPage);
		await expect(guestPage.getByText("Preparing").first()).toBeVisible();

		await guestContext.close();
	});

	test("live order status updates for the guest as kitchen advances it (realtime)", async ({
		page,
		browser,
	}) => {
		const label = await createFreshTable(page, RESTAURANT_1_ID);
		const { context: guestContext, page: guestPage } =
			await openGuestSessionForTable(page, browser, label);
		await placeGuestOrder(guestPage);
		await expect(guestPage.getByText("Preparing").first()).toBeVisible();

		const kitchenContext = await browser.newContext({
			storageState: OTP_ROLES.kitchen.storageStatePath,
		});
		const kitchenPage = await kitchenContext.newPage();
		await kitchenPage.goto(`/restaurants/${RESTAURANT_1_ID}/kitchen`);
		const card = kitchenPage.locator(".card-enter", {
			hasText: `Table ${label}`,
		});
		await card.getByRole("button", { name: "Start Preparing" }).click();
		await card.getByRole("button", { name: "Mark Ready" }).click();

		const waiterContext = await browser.newContext({
			storageState: OTP_ROLES.waiter.storageStatePath,
		});
		const waiterPage = await waiterContext.newPage();
		await waiterPage.goto(`/restaurants/${RESTAURANT_1_ID}/kitchen`);
		await waiterPage
			.locator(".card-enter", { hasText: `Table ${label}` })
			.getByRole("button", { name: "Mark Served" })
			.click();

		// No reload — this genuinely exercises the realtime broadcast path
		// (session:{id} channel), not just refetch-on-navigation.
		await expect(guestPage.getByText("Served").first()).toBeVisible({
			timeout: 15_000,
		});

		await kitchenContext.close();
		await waiterContext.close();
		await guestContext.close();
	});

	test("Request Bill and view the itemized bill", async ({ page, browser }) => {
		const label = await createFreshTable(page, RESTAURANT_1_ID);
		const { context: guestContext, page: guestPage } =
			await openGuestSessionForTable(page, browser, label);
		await placeGuestOrder(guestPage);

		await guestPage.getByRole("button", { name: "Request Bill" }).click();
		await guestPage.getByRole("button", { name: "View Bill" }).click();
		await guestPage.waitForURL(/\/guest\/bill$/);
		await expect(guestPage.getByText(/Bill #/)).toBeVisible();
		await expect(guestPage.getByText("Paneer Butter Masala")).toBeVisible();

		await guestContext.close();
	});
});
