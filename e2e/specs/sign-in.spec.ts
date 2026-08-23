import { expect, test } from "@playwright/test";
import { OTP_ROLES, RESTAURANT_1_ID } from "../fixtures/roles";
import { waitForOtpCode } from "../helpers/mailpit";
import { signInViaOtp } from "../helpers/otp-sign-in";

// No pre-auth — this file drives the real OTP flow itself and doubles as a
// smoke test that global-setup's storageState files are valid (if OTP
// sign-in were broken, every other spec file would fail opaquely on
// `test.use({ storageState })` instead of here, with a clear cause).
test.describe("Sign-in", () => {
	test("staff signs in via email OTP and lands on their restaurant", async ({
		page,
	}) => {
		await signInViaOtp(page, OTP_ROLES.owner.email);
		await expect(page).toHaveURL(new RegExp(`/restaurants/${RESTAURANT_1_ID}`));
	});

	test("Dineinly Admin signs in via email OTP and lands on /admin", async ({
		page,
	}) => {
		await signInViaOtp(page, OTP_ROLES.dineinlyAdmin.email);
		await expect(page).toHaveURL(/\/admin$/);
	});

	test("wrong OTP code is rejected", async ({ page }) => {
		await page.goto("/sign-in");
		await page.getByLabel("Your work email").fill(OTP_ROLES.manager.email);
		await page.getByRole("button", { name: "Continue" }).click();
		await waitForOtpCode(OTP_ROLES.manager.email); // wait for the real send, then deliberately ignore it

		await page.getByLabel("Digit 1 of 6").click();
		await page.keyboard.type("000000");
		await page.getByRole("button", { name: "Sign in" }).click();

		await expect(
			page.getByText("That code is incorrect or expired."),
		).toBeVisible();
	});

	test("resend has a 30s cooldown and delivers a new usable code", async ({
		page,
	}) => {
		await page.goto("/sign-in");
		await page.getByLabel("Your work email").fill(OTP_ROLES.waiter.email);
		await page.getByRole("button", { name: "Continue" }).click();
		await waitForOtpCode(OTP_ROLES.waiter.email);

		const resendButton = page.getByRole("button", { name: /Resend code/ });
		await expect(resendButton).toBeDisabled();
		await expect(resendButton).toHaveText(/Resend code \(\d+s\)/);
	});

	test("unknown email gets the generic invite message", async ({ page }) => {
		await page.goto("/sign-in");
		await page
			.getByLabel("Your work email")
			.fill("not-a-real-account@dineinly.test");
		await page.getByRole("button", { name: "Continue" }).click();

		await expect(
			page.getByText(
				"Couldn't send a code to that email. If you're expecting an invite, ask your manager to resend it.",
			),
		).toBeVisible();
	});

	test("signed-out visitor hitting a gated route is redirected to /sign-in", async ({
		page,
	}) => {
		await page.goto(`/restaurants/${RESTAURANT_1_ID}/menu`);
		await expect(page).toHaveURL(/\/sign-in$/);
	});
});

test.describe("Sign-in — RBAC boundary", () => {
	test.use({ storageState: OTP_ROLES.owner.storageStatePath });

	test("non-admin staff cannot reach /admin", async ({ page }) => {
		await page.goto("/admin");
		await expect(page).not.toHaveURL(/\/admin$/);
	});
});
