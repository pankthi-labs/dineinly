import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * As an already-authenticated owner/manager `page` on the Staff Roster
 * page, generates a fresh 8-digit pairing code (station-panel.tsx) and
 * returns it.
 */
export async function generatePairingCode(page: Page): Promise<string> {
	await page.getByRole("button", { name: "Pair a Floor Tablet" }).click();
	const codeLocator = page.locator("p.tracking-widest");
	await expect(codeLocator).toBeVisible();
	const code = (await codeLocator.textContent())?.trim();
	if (!code) {
		throw new Error("Pairing code did not render.");
	}
	return code;
}

/**
 * Redeems a pairing code in a brand-new browser context (a station device
 * is a separate physical tablet, never the same browser session as the
 * owner/manager who generated the code) — drives the real /station/pair
 * form. Returns the new context/page, left on /restaurants/{id}/floor with
 * a live station session. Caller is responsible for closing the context.
 */
export async function redeemPairingCode(
	browser: Browser,
	baseURL: string,
	code: string,
): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${baseURL}/station/pair`);
	await page.getByLabel("Pairing code").fill(code);
	await page.getByRole("button", { name: "Pair Device" }).click();
	await page.waitForURL(/\/restaurants\/.+\/floor$/, { timeout: 15_000 });
	return { context, page };
}

/**
 * As an already-authenticated staff `page` (any restaurant page rendering
 * the shared header — restaurant home is the simplest), sets that person's
 * own attribution PIN via the self-service Profile sheet
 * (admin/profile-sheet.tsx). Idempotent — safe to call every run, the field
 * is labeled "PIN" the first time and "New PIN" thereafter, but the same
 * locator (by placeholder, scoped to the open sheet) works either way.
 */
export async function setOwnPin(
	page: Page,
	restaurantId: string,
	pin: string,
): Promise<void> {
	await page.goto(`/restaurants/${restaurantId}`);
	await page.getByRole("button", { name: "More actions" }).click();
	await page.getByRole("button", { name: "Profile" }).click();
	const sheet = page.getByRole("dialog", { name: "Profile" });
	await sheet.getByPlaceholder("••••").fill(pin);
	await sheet.getByRole("button", { name: "Save Changes" }).click();
	await expect(sheet).not.toBeVisible();
}

/** On a paired station device's /floor page, enters `pin` at the unlock overlay. */
export async function unlockStationPin(page: Page, pin: string): Promise<void> {
	await expect(
		page.getByRole("heading", { name: "Enter your PIN" }),
	).toBeVisible();
	await page.getByPlaceholder("••••").fill(pin);
	await page.getByRole("button", { name: "Unlock" }).click();
}

/** Clears the acting-staff attribution on a paired station device (device stays paired). */
export async function switchUser(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Switch User" }).click();
	await expect(
		page.getByRole("heading", { name: "Enter your PIN" }),
	).toBeVisible();
}
