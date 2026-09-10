import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { menuItemInputSchema } from "@/lib/menu-item-schema";
import { needsBillingDetails } from "@/server/routers/restaurants.schema";
import type { Context } from "../trpc/context";
import { authedProcedure, router } from "../trpc/init";
import { requireStaffRole } from "../trpc/rbac";

// Labels are a restaurant-managed vocabulary (see menu_labels), not a fixed
// enum — this is the runtime check a zod schema can't express.
async function assertKnownLabels(
	auth: Context["auth"],
	restaurantId: string,
	labels: string[],
) {
	if (labels.length === 0) return;

	const { data, error } = await auth
		.from("menu_labels")
		.select("name")
		.eq("restaurant_id", restaurantId)
		.in("name", labels);

	if (error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Unable to validate labels.",
			cause: error,
		});
	}

	const known = new Set((data ?? []).map((row) => row.name));
	const unknown = labels.filter((label) => !known.has(label));
	if (unknown.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Unknown label(s): ${unknown.join(", ")}. Add them first.`,
		});
	}
}

// Shared by createItem and updateItem: both need the same category
// membership + label vocabulary checks before writing.
async function validateMenuItemWrite(
	auth: Context["auth"],
	input: { restaurantId: string; categoryId: string; labels: string[] },
): Promise<void> {
	const { data: category, error: categoryError } = await auth
		.from("menu_categories")
		.select("id")
		.eq("id", input.categoryId)
		.eq("restaurant_id", input.restaurantId)
		.maybeSingle();

	if (categoryError) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Unable to validate the menu category.",
			cause: categoryError,
		});
	}
	if (!category) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Choose a category from this restaurant.",
		});
	}

	await assertKnownLabels(auth, input.restaurantId, input.labels);
}

// Shared by createItem and updateItem: the column set both an insert and an
// update write, mapped from the one input schema they both validate against.
function menuItemColumns(input: z.infer<typeof menuItemInputSchema>) {
	return {
		category_id: input.categoryId,
		name: input.name,
		description: input.description,
		price: input.price,
		prep_time: input.prepTime,
		serving_size: input.servingSize,
		diet: input.diet,
		availability: input.availability,
		schedule_days: input.scheduleDays,
		schedule_start_time: input.scheduleStartTime,
		schedule_end_time: input.scheduleEndTime,
		labels: [...new Set(input.labels)],
		offers_spice: input.offersSpice,
		offers_salt: input.offersSalt,
		offers_ice: input.offersIce,
		status: input.status,
	};
}

const restaurantIdSchema = z.string().uuid();
const menuCategoryInputSchema = z.object({
	restaurantId: restaurantIdSchema,
	name: z.string().trim().min(1),
	// Null on Menu/Guest — those experiences never generate a Dineinly bill,
	// so there's no tax rate to snapshot (docs/product.md § Dineinly
	// Experiences).
	taxRate: z.number().finite().min(0).max(1).nullable(),
});
const menuLabelInputSchema = z.object({
	restaurantId: restaurantIdSchema,
	name: z.string().trim().min(1),
});
const menuCategoryReorderInputSchema = z.object({
	restaurantId: restaurantIdSchema,
	categoryIds: z.array(z.string().uuid()).min(1),
});
const menuItemUpdateSchema = menuItemInputSchema.extend({
	itemId: z.string().uuid(),
});
const menuItemStateInputSchema = z.object({
	restaurantId: restaurantIdSchema,
	itemId: z.string().uuid(),
	action: z.enum(["hide", "show", "mark_sold_out", "mark_available"]),
});

// The management view intentionally includes archived categories and items so
// an administrator (or this restaurant's own staff) can see the complete
// restaurant catalog. Guest-facing menu queries remain limited by their
// separate active-only RLS policies.
//
// authedProcedure, not adminProcedure — every procedure here is reachable by
// this restaurant's own staff, not just Dineinly Admin. listForManagement
// (read) is any active staff, per staff_select_menu_* RLS (supabase/
// migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 5); every
// write below is Owner/Manager only ("Manage Menu", docs/product.md § RBAC)
// — requireStaffRole is a clear error before the request, staff_write_menu_*
// RLS is the real enforcement underneath it. updateItemState's availability
// branch is the one exception (Waiter/Kitchen ✅ "Update Item Availability"),
// so it calls set_menu_item_availability (§ 7 of that migration) instead of
// a direct table write, and skips the role check.
export const menuRouter = router({
	listForManagement: authedProcedure
		.input(z.object({ restaurantId: restaurantIdSchema }))
		.query(async ({ ctx, input }) => {
			const [restaurantResult, categoriesResult, itemsResult, labelsResult] =
				await Promise.all([
					ctx.auth
						.from("restaurants")
						.select("id, name, experience")
						.eq("id", input.restaurantId)
						.maybeSingle(),
					ctx.auth
						.from("menu_categories")
						.select("id, name, sort, status")
						.eq("restaurant_id", input.restaurantId)
						.order("sort", { ascending: true })
						.order("name", { ascending: true }),
					ctx.auth
						.from("menu_items")
						.select(
							"id, category_id, name, description, price, prep_time, serving_size, diet, availability, schedule_days, schedule_start_time, schedule_end_time, labels, offers_spice, offers_salt, offers_ice, status",
						)
						.eq("restaurant_id", input.restaurantId)
						// status/availability declared active-before-archived and
						// available-before-sold_out (packages/db/src/schema/enums.ts),
						// so ascending sorts live+available items first, sold-out
						// next, hidden last — within each, name breaks ties.
						.order("status", { ascending: true })
						.order("availability", { ascending: true })
						.order("name", { ascending: true }),
					ctx.auth
						.from("menu_labels")
						.select("id, name")
						.eq("restaurant_id", input.restaurantId)
						.order("name", { ascending: true }),
				]);

			for (const result of [
				restaurantResult,
				categoriesResult,
				itemsResult,
				labelsResult,
			]) {
				if (result.error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Unable to load the restaurant menu.",
						cause: result.error,
					});
				}
			}

			if (!restaurantResult.data) {
				return null;
			}

			const categories = categoriesResult.data ?? [];
			const items = itemsResult.data ?? [];

			return {
				restaurant: restaurantResult.data,
				labels: labelsResult.data ?? [],
				categories: categories.map((category) => ({
					...category,
					items: items.filter((item) => item.category_id === category.id),
				})),
			};
		}),
	createCategory: authedProcedure
		.input(menuCategoryInputSchema)
		.mutation(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			const [restaurantResult, lastCategoryResult] = await Promise.all([
				ctx.auth
					.from("restaurants")
					.select("id, experience")
					.eq("id", input.restaurantId)
					.maybeSingle(),
				ctx.auth
					.from("menu_categories")
					.select("sort")
					.eq("restaurant_id", input.restaurantId)
					.order("sort", { ascending: false })
					.limit(1)
					.maybeSingle(),
			]);

			if (restaurantResult.error || lastCategoryResult.error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to prepare the new category.",
					cause: restaurantResult.error ?? lastCategoryResult.error,
				});
			}

			if (!restaurantResult.data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "This restaurant is no longer available.",
				});
			}

			// showTaxField (apps/web/app/restaurants/[restaurantId]/menu/
			// add-category-panel.tsx) is UX only — One/Counter require a tax rate
			// to snapshot onto every order_item at order time, so a null here on
			// those experiences would silently under-bill.
			if (
				needsBillingDetails(restaurantResult.data.experience) &&
				input.taxRate === null
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Enter a tax rate for this category.",
				});
			}

			const { data, error } = await ctx.auth
				.from("menu_categories")
				.insert({
					restaurant_id: input.restaurantId,
					name: input.name,
					tax_rate: input.taxRate,
					sort: (lastCategoryResult.data?.sort ?? -1) + 1,
				})
				.select("id")
				.single();

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to add the category.",
					cause: error,
				});
			}

			return data;
		}),
	reorderCategories: authedProcedure
		.input(menuCategoryReorderInputSchema)
		.mutation(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			const { data: existing, error: existingError } = await ctx.auth
				.from("menu_categories")
				.select("id")
				.eq("restaurant_id", input.restaurantId);

			if (existingError) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to load the current category order.",
					cause: existingError,
				});
			}

			const existingIds = new Set((existing ?? []).map((row) => row.id));
			const inputIds = new Set(input.categoryIds);
			if (
				existingIds.size !== inputIds.size ||
				[...existingIds].some((id) => !inputIds.has(id))
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "The category list is out of date. Refresh and try again.",
				});
			}

			const { error } = await ctx.auth.rpc("reorder_menu_categories", {
				p_restaurant_id: input.restaurantId,
				p_category_ids: input.categoryIds,
			});

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to save the new category order.",
					cause: error,
				});
			}

			return { success: true };
		}),
	createLabel: authedProcedure
		.input(menuLabelInputSchema)
		.mutation(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			const { data, error } = await ctx.auth
				.from("menu_labels")
				.insert({ restaurant_id: input.restaurantId, name: input.name })
				.select("id, name")
				.single();

			if (error) {
				throw new TRPCError({
					code:
						error.code === "23505" ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
					message:
						error.code === "23505"
							? "This label already exists."
							: "Unable to add the label.",
					cause: error,
				});
			}

			return data;
		}),
	createItem: authedProcedure
		.input(menuItemInputSchema)
		.mutation(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			await validateMenuItemWrite(ctx.auth, input);

			const { data, error } = await ctx.auth
				.from("menu_items")
				.insert({
					restaurant_id: input.restaurantId,
					...menuItemColumns(input),
				})
				.select("id")
				.single();

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to add the dish.",
					cause: error,
				});
			}

			return data;
		}),
	updateItem: authedProcedure
		.input(menuItemUpdateSchema)
		.mutation(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			await validateMenuItemWrite(ctx.auth, input);

			const { data, error } = await ctx.auth
				.from("menu_items")
				.update({
					...menuItemColumns(input),
					updated_at: new Date().toISOString(),
				})
				.eq("id", input.itemId)
				.eq("restaurant_id", input.restaurantId)
				.select("id")
				.maybeSingle();

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to save the dish.",
					cause: error,
				});
			}

			if (!data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "This dish is no longer available to edit.",
				});
			}

			return data;
		}),
	updateItemState: authedProcedure
		.input(menuItemStateInputSchema)
		.mutation(async ({ ctx, input }) => {
			// Availability only means anything for a dish the guest can see —
			// a hidden dish must be shown again before its availability changes.
			const isAvailabilityAction =
				input.action === "mark_sold_out" || input.action === "mark_available";

			// "Update Item Availability" (Waiter/Kitchen/Manager/Owner) goes
			// through set_menu_item_availability — any active staff, no role
			// check here — since staff_write_menu_items RLS now restricts a
			// direct table write to Owner/Manager only. "hide"/"show" ("Manage
			// Menu") stay a direct write, gated to Owner/Manager below.
			if (isAvailabilityAction) {
				const { data, error } = await ctx.auth.rpc(
					"set_menu_item_availability",
					{
						p_restaurant_id: input.restaurantId,
						p_item_id: input.itemId,
						p_availability:
							input.action === "mark_sold_out" ? "sold_out" : "available",
					},
				);

				if (error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Unable to update the dish.",
						cause: error,
					});
				}
				const updated = data?.[0];
				if (!updated) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Show this dish before changing its availability.",
					});
				}
				return { id: updated.id };
			}

			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			const { data, error } = await ctx.auth
				.from("menu_items")
				.update({
					status: input.action === "show" ? "active" : "archived",
					updated_at: new Date().toISOString(),
				})
				.eq("id", input.itemId)
				.eq("restaurant_id", input.restaurantId)
				.select("id")
				.maybeSingle();

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to update the dish.",
					cause: error,
				});
			}

			if (!data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "This dish is no longer available.",
				});
			}

			return data;
		}),
});
