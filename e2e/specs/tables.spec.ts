import { expect, test } from "@playwright/test";
import {
	ARBOR_OWNER_STORAGE_STATE,
	ARBOR_TABLES,
	OTP_ROLES,
	RESTAURANT_1_ID,
	RESTAURANT_1_TABLES,
	RESTAURANT_2_ID,
} from "../fixtures/roles";
import { uniqueName } from "../helpers/unique";

const TABLES_PATH = `/restaurants/${RESTAURANT_1_ID}/tables`;

test.describe("Table Matrix — Restaurant 1 CRUD", () => {
	test.use({ storageState: OTP_ROLES.owner.storageStatePath });

	test("lists seeded tables with correct occupied/free status", async ({
		page,
	}) => {
		await page.goto(TABLES_PATH);
		await expect(
			page.getByRole("button", {
				name: `Edit ${RESTAURANT_1_TABLES.t1Occupied.label}`,
			}),
		).toHaveCount(0); // occupied — Edit is withheld entirely, not just disabled
		await expect(
			page.getByRole("button", {
				name: `Edit ${RESTAURANT_1_TABLES.t3Free.label}`,
			}),
		).toBeVisible();
	});

	test("create, edit, hide, regenerate QR, and download PDF", async ({
		page,
	}) => {
		const label = uniqueName("E2E Table").slice(0, 40); // schema caps table labels at 40 chars
		const renamed = `${label} v2`.slice(0, 40);

		await page.goto(TABLES_PATH);
		await page.getByRole("button", { name: "Create Table" }).click();
		await page.getByLabel("Table label").fill(label);
		// Trigger and submit share the exact text "Create Table" — scope to
		// the open dialog so strict mode doesn't have to guess which one.
		await page
			.getByRole("dialog")
			.getByRole("button", { name: "Create Table" })
			.click();
		await expect(page.getByText(label)).toBeVisible();

		// Edit
		await page.getByRole("button", { name: `Edit ${label}` }).click();
		await page.getByLabel("Table label").fill(renamed);
		await page.getByRole("button", { name: "Save Changes" }).click();
		await expect(page.getByText(renamed)).toBeVisible();

		// Regenerate QR
		await page
			.getByRole("button", { name: `Regenerate QR for ${renamed}` })
			.click();
		await page.getByRole("button", { name: "Regenerate", exact: true }).click();

		// Download single QR PDF
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: `Show QR for ${renamed}` }).click(),
		]);
		await page.getByRole("button", { name: "Download PDF" }).click();
		expect(await download.path()).toBeTruthy();
		await page.keyboard.press("Escape");

		// Hide, then show again — restores it to a normal listed state.
		await page.getByRole("button", { name: `Hide ${renamed}` }).click();
		await page.getByRole("button", { name: "Hide", exact: true }).click();
		await page.getByRole("button", { name: `Show ${renamed}` }).click();
		await page.getByRole("button", { name: "Show", exact: true }).click();
	});

	test("download all QR codes", async ({ page }) => {
		await page.goto(TABLES_PATH);
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "Download All QR Codes" }).click(),
		]);
		expect(await download.path()).toBeTruthy();
	});
});

test.describe("Table Matrix — Arbor (read-only)", () => {
	test.use({ storageState: ARBOR_OWNER_STORAGE_STATE });

	test("merged group, communal table, and full 30-table grid render correctly", async ({
		page,
	}) => {
		await page.goto(`/restaurants/${RESTAURANT_2_ID}/tables`);

		for (const label of ARBOR_TABLES.mergedGroup) {
			await expect(page.getByText(label, { exact: true })).toBeVisible();
		}
		await expect(
			page.getByText(ARBOR_TABLES.communal.label, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(ARBOR_TABLES.free.label, { exact: true }),
		).toBeVisible();
		await expect(page.getByText("T30", { exact: true })).toBeVisible();
	});
});

test.describe("Table Matrix RBAC boundary", () => {
	test.use({ storageState: OTP_ROLES.waiter.storageStatePath });

	test("waiter cannot reach Table Matrix", async ({ page }) => {
		await page.goto(TABLES_PATH);
		await expect(page).not.toHaveURL(new RegExp(`${RESTAURANT_1_ID}/tables$`));
	});
});
