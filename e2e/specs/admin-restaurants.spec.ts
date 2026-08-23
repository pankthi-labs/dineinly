import { expect, test } from "@playwright/test";
import { OTP_ROLES } from "../fixtures/roles";
import { uniqueEmail, uniqueName } from "../helpers/unique";

test.use({ storageState: OTP_ROLES.dineinlyAdmin.storageStatePath });

test.describe("Admin — Restaurants Directory", () => {
	test("lists the seeded restaurants", async ({ page }) => {
		await page.goto("/admin/restaurants");
		await expect(
			page.getByRole("heading", { name: "Dineinly Test Kitchen" }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Arbor Brewing Company" }),
		).toBeVisible();
	});

	test("create, edit, pause, and reactivate a restaurant", async ({ page }) => {
		const name = uniqueName("E2E Test Restaurant");
		const renamed = `${name} (renamed)`;

		await page.goto("/admin/restaurants");
		await page.getByRole("button", { name: "Create Restaurant" }).click();

		await page.getByLabel("Restaurant name").fill(name);
		await page.getByLabel("Address").fill("1 Test Lane");
		await page.getByLabel("City").fill("Bengaluru");
		await page.getByLabel("State").fill("Karnataka");
		await page.getByLabel("Pincode").fill("560001");
		await page.getByLabel("GST number").fill("29TESTE2E1234Z9");
		await page.getByLabel("Owner name").fill("E2E Owner");
		await page.getByLabel("Owner email").fill(uniqueEmail("owner"));
		await page.getByLabel("Owner mobile").fill("+919876500000");
		// Trigger and submit share the exact text "Create Restaurant" — scope
		// to the open dialog so strict mode doesn't have to guess which one.
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Create Restaurant" })
			.click();

		// Plain string, not RegExp — `renamed` below contains literal
		// parentheses, which RegExp would parse as a capture group instead of
		// literal text. getByRole's `name` already does substring matching on
		// a plain string.
		const row = page.getByRole("button", { name });
		await expect(row).toBeVisible();

		// Edit
		await row.click();
		await page.getByRole("button", { name: "Edit" }).click();
		await page.getByLabel("Restaurant name").fill(renamed);
		await page.getByRole("button", { name: "Save Changes" }).click();
		await expect(page.getByRole("button", { name: renamed })).toBeVisible();

		// Pause — the row (keyed by id, same as Menu Desk's expandedItemId
		// pattern) is already expanded from the Edit step above and stays that
		// way across the mutation's refetch, so no re-toggle click here.
		await page.getByRole("button", { name: "Pause Restaurant" }).click();
		await page.getByRole("button", { name: "Pause", exact: true }).click();
		await expect(page.getByText("Paused").first()).toBeVisible();

		// Reactivate — restores it to a normal state for anything else that lists it.
		await page.getByRole("button", { name: "Reactivate Restaurant" }).click();
		await page.getByRole("button", { name: "Reactivate", exact: true }).click();
		await expect(page.getByText("Live").first()).toBeVisible();
	});

	test("missing required field keeps the sheet open with an inline error", async ({
		page,
	}) => {
		await page.goto("/admin/restaurants");
		await page.getByRole("button", { name: "Create Restaurant" }).click();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Create Restaurant" })
			.click();
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect(page.getByRole("alert").first()).toBeVisible();
	});
});
