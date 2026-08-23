import { expect, test } from "@playwright/test";
import { OTP_ROLES, RESTAURANT_1_ID } from "../fixtures/roles";
import { placeGuestOrder } from "../helpers/guest-order";
import { createFreshTable, openGuestSessionForTable } from "../helpers/tables";

const KITCHEN_PATH = `/restaurants/${RESTAURANT_1_ID}/kitchen`;

test.describe("Kitchen — read-only", () => {
	test.use({ storageState: OTP_ROLES.kitchen.storageStatePath });

	test("queue renders the seeded active session's known items", async ({
		page,
	}) => {
		await page.goto(KITCHEN_PATH);
		// Seeded order items on the active session (supabase/seed.sql):
		// Chicken 65 (placed), Veg Biryani (preparing), Cold Coffee (ready).
		await expect(page.getByText("Chicken 65")).toBeVisible();
		await expect(page.getByText("Veg Biryani")).toBeVisible();
		await expect(page.getByText("Cold Coffee")).toBeVisible();
	});
});

test.describe("Kitchen — order lifecycle (fresh order, not the seeded session)", () => {
	test.use({ storageState: OTP_ROLES.owner.storageStatePath });

	test("Start Preparing → Mark Ready → Mark Served advances a freshly-placed order", async ({
		page,
		browser,
	}) => {
		const label = await createFreshTable(page, RESTAURANT_1_ID);
		const { context: guestContext, page: guestPage } =
			await openGuestSessionForTable(page, browser, label);
		await placeGuestOrder(guestPage);
		await guestContext.close();

		await page.goto(KITCHEN_PATH);
		const card = page.locator(".card-enter", { hasText: `Table ${label}` });
		await expect(card).toBeVisible();

		await card.getByRole("button", { name: "Start Preparing" }).click();
		await expect(
			card.getByRole("button", { name: "Mark Ready" }),
		).toBeVisible();

		await card.getByRole("button", { name: "Mark Ready" }).click();
		await expect(
			card.getByRole("button", { name: "Mark Served" }),
		).toBeVisible();

		await card.getByRole("button", { name: "Mark Served" }).click();
		await expect(card).not.toBeVisible();
	});
});

test.describe("Kitchen RBAC boundary", () => {
	test.use({ storageState: OTP_ROLES.waiter.storageStatePath });

	test("waiter can serve but not advance kitchen-side status", async ({
		page,
	}) => {
		await page.goto(KITCHEN_PATH);
		// Seeded Cold Coffee is already "ready" — a waiter should be able to
		// serve it, but never see kitchen-only advance actions anywhere on
		// this page.
		await expect(
			page.getByRole("button", { name: "Mark Served" }).first(),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Start Preparing" }),
		).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Mark Ready" })).toHaveCount(
			0,
		);
	});
});
