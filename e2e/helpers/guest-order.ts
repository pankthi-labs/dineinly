import type { Page } from "@playwright/test";

/**
 * On an already-on-/guest/menu `guestPage`, quick-adds one unit of
 * `itemName` (the card's own "Add" pill — components/quantity-pill.tsx —
 * skips the item drawer's spice/salt/ice customization, fine for flows that
 * only need *an* order to exist) and confirms it from the cart. Leaves the
 * guest on /guest/orders.
 */
export async function placeGuestOrder(
	guestPage: Page,
	itemName = "Paneer Butter Masala",
): Promise<void> {
	const card = guestPage.locator("div", { hasText: itemName }).last();
	await card.getByRole("button", { name: "Add" }).click();

	await guestPage.getByRole("button", { name: /Review Order/ }).click();
	await guestPage.waitForURL(/\/guest\/cart$/);
	await guestPage.getByRole("button", { name: "Confirm Order" }).click();
	await guestPage.waitForURL(/\/guest\/orders$/, { timeout: 10_000 });
}
