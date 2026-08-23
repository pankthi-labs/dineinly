import { expect, test } from "@playwright/test";
import { OTP_ROLES, RESTAURANT_1_ID } from "../fixtures/roles";
import { uniqueName } from "../helpers/unique";

test.use({ storageState: OTP_ROLES.owner.storageStatePath });

const MENU_PATH = `/restaurants/${RESTAURANT_1_ID}/menu`;

test.describe("Menu Desk", () => {
	test("management view lists seeded categories and items, including sold-out and hidden", async ({
		page,
	}) => {
		await page.goto(MENU_PATH);
		await expect(page.getByText("Food").first()).toBeVisible();
		await expect(page.getByText("Beverages").first()).toBeVisible();
		await expect(page.getByText("Sold out").first()).toBeVisible();
		// The seeded archived item ("Dal Fry (old recipe)") renders dimmed but
		// present — Menu Desk needs it visible to manage it, unlike the guest menu.
		await expect(page.getByText("Hidden").first()).toBeVisible();
	});

	test("add category, add label, add dish, edit it, then hide/show and sold-out/available", async ({
		page,
	}) => {
		// Note: category/dish names render through titleCase() on this page —
		// use single-capital-per-word names so the rendered text matches what
		// was typed exactly (an "E2E"-style acronym would come back "E2e").
		const categoryName = uniqueName("Test Category");
		const labelName = uniqueName("Test Label");
		const dishName = uniqueName("Test Dish");
		const renamedDish = `${dishName} Renamed`;

		await page.goto(MENU_PATH);

		// Add category
		await page.getByRole("button", { name: "Add category" }).click();
		await page.getByLabel("Category name").fill(categoryName);
		await page.getByLabel("Tax rate (%)").fill("5");
		await page.getByRole("button", { name: "Save category" }).click();
		await expect(page.getByText(categoryName)).toBeVisible();

		// Add label
		await page.getByRole("button", { name: "Add label" }).click();
		await page.getByLabel("Label name").fill(labelName);
		await page.getByRole("button", { name: "Save label" }).click();

		// Add dish under the new category. "Category" alone would substring-match
		// the category's reorder buttons and region name too (all contain
		// "Category" as a fragment) — Field's `required` marker also suffixes
		// the accessible name with "*", so anchor with a regex instead of the
		// plain string either way.
		await page.getByRole("button", { name: "Add dish" }).click();
		const dishDialog = page.getByRole("dialog", { name: "Add Dish" });
		await dishDialog
			.getByLabel(/^Category\*?$/)
			.selectOption({ label: categoryName });
		await dishDialog.getByLabel("Dish name").fill(dishName);
		await dishDialog
			.getByLabel("Description")
			.fill("An E2E-created dish, safe to create/mutate repeatedly.");
		await dishDialog.getByLabel("Price (₹)").fill("199");
		await dishDialog.getByLabel("Status").selectOption({ label: "Live" });
		await dishDialog
			.getByLabel("Dietary type")
			.selectOption({ label: "Vegetarian" });
		await dishDialog.getByLabel("Preparation time").selectOption({ index: 1 });
		await dishDialog.getByLabel("Serving size").selectOption({ index: 1 });
		// Trigger and submit share the exact text "Add dish" — scope to the
		// open dialog so strict mode doesn't have to guess which one.
		await dishDialog.getByRole("button", { name: "Add dish" }).click();
		await expect(page.getByRole("heading", { name: dishName })).toBeVisible();

		// Expand the new dish's card (accordion) to reach its row actions. Plain
		// string, not RegExp — a name containing regex metacharacters (parens,
		// etc.) would be misparsed; getByRole's `name` already does substring
		// matching on a plain string.
		const dishToggle = page.getByRole("button", { name: dishName });
		await dishToggle.click();

		// Edit
		await page.getByRole("button", { name: "Edit dish" }).click();
		await page.getByLabel("Dish name").fill(renamedDish);
		await page.getByRole("button", { name: "Save changes" }).click();
		await expect(
			page.getByRole("heading", { name: renamedDish }),
		).toBeVisible();

		const renamedToggle = page.getByRole("button", { name: renamedDish });
		await renamedToggle.click();

		// Sold out / available toggle, restored to available.
		await page.getByRole("button", { name: "Mark sold out" }).click();
		await expect(page.getByText("Sold out").first()).toBeVisible();
		await page.getByRole("button", { name: "Mark available" }).click();

		// Hide / show, restored to shown. expandedItemId is keyed by item id
		// and untouched by the mutation's refetch, so the card stays open and
		// the button's label simply flips in place — no re-toggle needed.
		await page.getByRole("button", { name: "Hide dish" }).click();
		await expect(page.getByText("Hidden").first()).toBeVisible();
		await page.getByRole("button", { name: "Show dish" }).click();
	});
});

test.describe("Menu Desk RBAC boundary", () => {
	test.use({ storageState: OTP_ROLES.waiter.storageStatePath });

	test("waiter cannot reach Menu Desk", async ({ page }) => {
		await page.goto(MENU_PATH);
		await expect(page).not.toHaveURL(new RegExp(`${RESTAURANT_1_ID}/menu$`));
	});
});
