import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { uniqueName } from "./unique";

/**
 * As an already-authenticated owner/manager `page`, creates a fresh table
 * (via Table Matrix), then opens its QR modal and copies the real guest scan
 * URL to the clipboard (the same URL encoded into the QR image — there's no
 * plain-text rendering of it, so this is the one reliable way to get it
 * without OCR-ing a canvas). Requires the "chromium" project (clipboard
 * permissions aren't available in all engines).
 */
export async function createFreshTable(
	page: Page,
	restaurantId: string,
): Promise<string> {
	const label = uniqueName("E2E Table").slice(0, 40);

	await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.goto(`/restaurants/${restaurantId}/tables`);
	await page.getByRole("button", { name: "Create Table" }).click();
	await page.getByLabel("Table label").fill(label);
	// The trigger and the sheet's own submit button share the exact text
	// "Create Table" — scope to the open dialog so strict mode doesn't have
	// to guess which one.
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Create Table" })
		.click();
	await expect(page.getByText(label)).toBeVisible();

	return label;
}

/**
 * Copies the guest scan URL for `label`'s QR (table must already exist —
 * see createFreshTable) and opens it in a brand-new, unauthenticated
 * BrowserContext, exactly as a guest's own phone would. Caller closes the
 * returned context when done.
 */
export async function openGuestSessionForTable(
	page: Page,
	browser: Browser,
	label: string,
): Promise<{ context: BrowserContext; page: Page }> {
	await page.getByRole("button", { name: `Show QR for ${label}` }).click();
	await page.getByRole("button", { name: "Copy Link" }).click();
	const scanUrl = await page.evaluate(() => navigator.clipboard.readText());
	await page.keyboard.press("Escape");

	const context = await browser.newContext();
	const guestPage = await context.newPage();
	await guestPage.goto(scanUrl);
	await guestPage.waitForURL(/\/guest\/menu$/, { timeout: 10_000 });
	return { context, page: guestPage };
}
