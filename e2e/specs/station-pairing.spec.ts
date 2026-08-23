import { expect, test } from "@playwright/test";
import {
	OTP_ROLES,
	RESTAURANT_1_ID,
	RESTAURANT_1_STAFF,
} from "../fixtures/roles";
import {
	generatePairingCode,
	redeemPairingCode,
	setOwnPin,
	switchUser,
	unlockStationPin,
} from "../helpers/station";

const BASE_URL = "http://127.0.0.1:3000";
const WAITER_PIN = "482913";

test.use({ storageState: OTP_ROLES.owner.storageStatePath });

// Each test pairs its own fresh device — no shared long-lived station state,
// so these are safe to re-run without a DB reset.
test.describe("Station pairing", () => {
	test("pair a device, set a PIN, unlock, switch user, and revoke", async ({
		page: ownerPage,
		browser,
	}) => {
		await ownerPage.goto(`/restaurants/${RESTAURANT_1_ID}/staff`);
		const code = await generatePairingCode(ownerPage);

		const { context: stationContext, page: stationPage } =
			await redeemPairingCode(browser, BASE_URL, code);
		try {
			// The real staff member sets their own PIN, via their own OTP
			// session — the station identity never carries a PIN of its own.
			const waiterContext = await browser.newContext({
				storageState: OTP_ROLES.waiter.storageStatePath,
			});
			const waiterPage = await waiterContext.newPage();
			await setOwnPin(waiterPage, RESTAURANT_1_ID, WAITER_PIN);
			await waiterContext.close();

			await stationPage.reload();
			await unlockStationPin(stationPage, WAITER_PIN);
			await expect(
				stationPage.getByText(`Acting as ${RESTAURANT_1_STAFF.waiter.name}`),
			).toBeVisible();

			await switchUser(stationPage);

			// Wrong PIN is rejected.
			await stationPage.getByPlaceholder("••••").fill("000000");
			await stationPage.getByRole("button", { name: "Unlock" }).click();
			await expect(stationPage.getByText("PIN not recognized.")).toBeVisible();
		} finally {
			await stationContext.close();
		}

		// Revoke the device from the roster's device list.
		await ownerPage.goto(`/restaurants/${RESTAURANT_1_ID}/staff`);
		await ownerPage.getByRole("button", { name: "Revoke" }).first().click();
		await expect(
			ownerPage.getByText("No floor tablets paired yet."),
		).toBeVisible();
	});

	test("invalid pairing code is rejected", async ({ browser }) => {
		// Unauthenticated by design — the pairing page is device-facing, not
		// viewer-facing (station/pair/page.tsx). A fresh, storageState-free
		// context avoids inheriting the describe block's owner session.
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${BASE_URL}/station/pair`);
		await page.getByLabel("Pairing code").fill("00000000");
		await page.getByRole("button", { name: "Pair Device" }).click();
		await expect(page.getByText(/not valid|expired/i)).toBeVisible();
		await context.close();
	});
});
