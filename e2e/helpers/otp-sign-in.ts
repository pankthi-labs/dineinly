import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { waitForOtpCode } from "./mailpit";

/**
 * Drives the real /sign-in UI (apps/web/app/sign-in/sign-in-form.tsx) start
 * to finish: email → Mailpit-retrieved OTP → verify → linking → redirect.
 * Leaves `page` on whatever the app redirects to (/admin or
 * /restaurants/{id}) with a live, cookie-backed session.
 */
export async function signInViaOtp(page: Page, email: string): Promise<void> {
	await page.goto("/sign-in");

	await page.getByLabel("Your work email").fill(email);
	await page.getByRole("button", { name: "Continue" }).click();

	await expect(
		page.getByRole("heading", { name: "Verify login" }),
	).toBeVisible();

	const code = await waitForOtpCode(email);

	// Digit boxes auto-advance focus on input (sign-in-form.tsx's
	// handleChange), so focusing the first one and typing the whole code
	// fills all six in order — no clipboard-paste simulation needed.
	await page.getByLabel("Digit 1 of 6").click();
	await page.keyboard.type(code);

	await page.getByRole("button", { name: "Sign in" }).click();

	// "Setting up your account…" (linking step) resolves into a redirect to
	// either /admin or /restaurants/{id} — wait for navigation away from
	// /sign-in rather than a specific URL, since callers cover both roles.
	await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
		timeout: 15_000,
	});
}
