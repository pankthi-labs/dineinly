import { expect, test } from "@playwright/test";
import { OTP_ROLES } from "../fixtures/roles";
import { uniqueEmail, uniqueName } from "../helpers/unique";

test.use({ storageState: OTP_ROLES.dineinlyAdmin.storageStatePath });

test.describe("Admin — Dineinly Staff", () => {
	test("lists the seeded admin", async ({ page }) => {
		await page.goto("/admin/staff");
		await expect(page.getByText("admin@dineinly.com")).toBeVisible();
	});

	test("invite, edit, and remove a Dineinly admin", async ({ page }) => {
		const name = uniqueName("E2E Test Admin");
		const email = uniqueEmail("admin", "dineinly.com");
		const renamed = `${name} (renamed)`;

		await page.goto("/admin/staff");
		await page.getByRole("button", { name: "Invite Admin" }).click();
		await page.getByLabel("Full name").fill(name);
		await page.getByLabel("Email address").fill(email);
		// Trigger and submit share the exact text "Invite Admin" — scope to
		// the open dialog so strict mode doesn't have to guess which one.
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Invite Admin" })
			.click();

		await expect(page.getByText(name)).toBeVisible();

		await page.getByRole("button", { name: `Edit ${name}` }).click();
		await page.getByLabel("Full name").fill(renamed);
		await page.getByRole("button", { name: "Save Changes" }).click();
		await expect(page.getByText(renamed)).toBeVisible();

		await page.getByRole("button", { name: `Remove ${renamed}` }).click();
		await page.getByRole("button", { name: "Remove", exact: true }).click();
		await expect(page.getByText(renamed)).not.toBeVisible();
	});
});

test.describe("Admin — Dineinly Staff RBAC boundary", () => {
	test.use({ storageState: OTP_ROLES.owner.storageStatePath });

	test("restaurant owner cannot reach /admin/staff", async ({ page }) => {
		await page.goto("/admin/staff");
		await expect(page).not.toHaveURL(/\/admin\/staff$/);
	});
});
