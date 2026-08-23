import { expect, test } from "@playwright/test";
import {
	OTP_ROLES,
	RESTAURANT_1_ID,
	RESTAURANT_1_STAFF,
} from "../fixtures/roles";
import { uniqueEmail, uniqueName } from "../helpers/unique";

test.use({ storageState: OTP_ROLES.owner.storageStatePath });

const ROSTER_PATH = `/restaurants/${RESTAURANT_1_ID}/staff`;

test.describe("Staff Roster", () => {
	test("lists all seeded staff with correct status", async ({ page }) => {
		await page.goto(ROSTER_PATH);
		await expect(page.getByText(RESTAURANT_1_STAFF.owner.name)).toBeVisible();
		await expect(page.getByText(RESTAURANT_1_STAFF.manager.name)).toBeVisible();
		await expect(page.getByText(RESTAURANT_1_STAFF.waiter.name)).toBeVisible();
		await expect(page.getByText(RESTAURANT_1_STAFF.kitchen.name)).toBeVisible();
		await expect(
			page.getByText(RESTAURANT_1_STAFF.invitedWaiter.name),
		).toBeVisible();
		await expect(
			page.getByText("Primary Owner", { exact: true }),
		).toBeVisible();
		await expect(page.getByText("Invited")).toBeVisible();
	});

	test("resend invite on the seeded invited row", async ({ page }) => {
		await page.goto(ROSTER_PATH);
		await page
			.getByRole("button", {
				name: `Resend invite to ${RESTAURANT_1_STAFF.invitedWaiter.name}`,
			})
			.click();
		// Idempotent — status stays Invited either way, just confirms the
		// action completes without error.
		await expect(
			page.getByText(RESTAURANT_1_STAFF.invitedWaiter.name),
		).toBeVisible();
	});

	test("invite, edit, and remove a staff member", async ({ page }) => {
		const name = uniqueName("E2E Test Waiter");
		const email = uniqueEmail("waiter-e2e");
		const renamed = `${name} (renamed)`;

		await page.goto(ROSTER_PATH);
		await page.getByRole("button", { name: "Add Staff" }).click();
		await page.getByLabel("Full name").fill(name);
		await page.getByLabel("Email address").fill(email);
		await page.getByLabel("Role").selectOption({ label: "Waiter" });
		await page.getByRole("button", { name: "Invite Staff" }).click();
		await expect(page.getByText(name)).toBeVisible();

		await page.getByRole("button", { name: `Edit ${name}` }).click();
		await page.getByLabel("Full name").fill(renamed);
		await page.getByLabel("Role").selectOption({ label: "Kitchen Staff" });
		await page.getByRole("button", { name: "Save Changes" }).click();
		await expect(page.getByText(renamed)).toBeVisible();

		await page.getByRole("button", { name: `Remove ${renamed}` }).click();
		await page.getByRole("button", { name: "Remove", exact: true }).click();
		await expect(page.getByText("Removed").first()).toBeVisible();
	});

	test("reassign primary owner and restore the original", async ({
		page,
		browser,
	}) => {
		const { owner, manager } = RESTAURANT_1_STAFF;
		await page.goto(ROSTER_PATH);

		// Promote the manager to Owner-role — reassignment is only offered
		// between two existing Owner-role rows.
		await page.getByRole("button", { name: `Edit ${manager.name}` }).click();
		await page.getByLabel("Role").selectOption({ label: "Owner" });
		await page.getByRole("button", { name: "Save Changes" }).click();

		// Reassign primary ownership to them.
		await page
			.getByRole("button", { name: `Make ${manager.name} the primary owner` })
			.click();
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Make Primary Owner" })
			.click();
		// Wait for the mutation to actually land (dialog closes on success),
		// not just for the click to register — a second browser context
		// opened right after this loads its own fresh page and won't refetch
		// on its own, so it would otherwise see the still-stale server state.
		// The badge itself never disappears — it just moves to whoever holds
		// the role now — so check Asha's own card specifically, not the page
		// as a whole.
		await expect(page.getByRole("dialog")).not.toBeVisible();
		const ashaCard = page.locator("div", { hasText: owner.name }).last();
		await expect(
			ashaCard.getByText("Primary Owner", { exact: true }),
		).not.toBeVisible();

		// Only the *current* primary owner (or Admin) may reassign — Asha's
		// own session loses that ability the moment Ravi becomes primary, so
		// reassigning back needs Ravi's session, not a second action on this
		// same page.
		const managerContext = await browser.newContext({
			storageState: OTP_ROLES.manager.storageStatePath,
		});
		const managerPage = await managerContext.newPage();
		await managerPage.goto(ROSTER_PATH);
		await managerPage
			.getByRole("button", { name: `Make ${owner.name} the primary owner` })
			.click();
		await managerPage
			.getByRole("dialog")
			.getByRole("button", { name: "Make Primary Owner" })
			.click();
		await expect(managerPage.getByRole("dialog")).not.toBeVisible();
		await expect(
			managerPage.getByText("Primary Owner", { exact: true }),
		).toBeVisible();
		await managerContext.close();

		// Demote the manager back to their original role — fully restores seed
		// state. Asha is primary owner again, so her own session can do this.
		await page.reload();
		await page.getByRole("button", { name: `Edit ${manager.name}` }).click();
		await page.getByLabel("Role").selectOption({ label: "Manager" });
		await page.getByRole("button", { name: "Save Changes" }).click();
	});

	test("generate a station-pairing code", async ({ page }) => {
		await page.goto(ROSTER_PATH);
		await page.getByRole("button", { name: "Pair a Floor Tablet" }).click();
		await expect(page.locator("p.tracking-widest")).toBeVisible();
		await expect(page.getByText(/Expires at/)).toBeVisible();
	});
});

test.describe("Staff Roster RBAC boundary", () => {
	test.use({ storageState: OTP_ROLES.waiter.storageStatePath });

	test("waiter cannot reach the Staff Roster", async ({ page }) => {
		await page.goto(ROSTER_PATH);
		await expect(page).not.toHaveURL(new RegExp(`${RESTAURANT_1_ID}/staff$`));
	});
});
