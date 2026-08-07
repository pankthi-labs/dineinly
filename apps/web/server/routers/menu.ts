import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { menuItemInputSchema } from "@/lib/menu-item-schema";
import type { Context } from "../trpc/context";
import { adminProcedure, router } from "../trpc/init";

// Labels are a restaurant-managed vocabulary (see menu_labels), not a fixed
// enum — this is the runtime check a zod schema can't express.
async function assertKnownLabels(
	supabase: Context["supabase"],
	restaurantId: string,
	labels: string[],
) {
	if (labels.length === 0) return;

	const { data, error } = await supabase
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

const restaurantIdSchema = z.string().uuid();
const menuCategoryInputSchema = z.object({
	restaurantId: restaurantIdSchema,
	name: z.string().trim().min(1),
	taxRate: z.number().finite().min(0).max(1),
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
// an administrator can see the complete restaurant catalog. Guest-facing menu
// queries remain limited by their separate active-only RLS policies.
export const menuRouter = router({
	listForManagement: adminProcedure
		.input(z.object({ restaurantId: restaurantIdSchema }))
		.query(async ({ ctx, input }) => {
			const [restaurantResult, categoriesResult, itemsResult, labelsResult] =
				await Promise.all([
					ctx.supabase
						.from("restaurants")
						.select("id, name")
						.eq("id", input.restaurantId)
						.maybeSingle(),
					ctx.supabase
						.from("menu_categories")
						.select("id, name, sort, status")
						.eq("restaurant_id", input.restaurantId)
						.order("sort", { ascending: true })
						.order("name", { ascending: true }),
					ctx.supabase
						.from("menu_items")
						.select(
							"id, category_id, name, description, price, prep_time, serving_size, diet, availability, labels, offers_spice, offers_salt, offers_ice, status",
						)
						.eq("restaurant_id", input.restaurantId)
						// status/availability declared active-before-archived and
						// available-before-sold_out (packages/db/src/schema/enums.ts),
						// so ascending sorts live+available items first, sold-out
						// next, hidden last — within each, name breaks ties.
						.order("status", { ascending: true })
						.order("availability", { ascending: true })
						.order("name", { ascending: true }),
					ctx.supabase
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
	createCategory: adminProcedure
		.input(menuCategoryInputSchema)
		.mutation(async ({ ctx, input }) => {
			const [restaurantResult, lastCategoryResult] = await Promise.all([
				ctx.supabase
					.from("restaurants")
					.select("id")
					.eq("id", input.restaurantId)
					.maybeSingle(),
				ctx.supabase
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

			const { data, error } = await ctx.supabase
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
	reorderCategories: adminProcedure
		.input(menuCategoryReorderInputSchema)
		.mutation(async ({ ctx, input }) => {
			const { data: existing, error: existingError } = await ctx.supabase
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

			const { error } = await ctx.supabase.rpc("reorder_menu_categories", {
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
	createLabel: adminProcedure
		.input(menuLabelInputSchema)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.supabase
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
	createItem: adminProcedure
		.input(menuItemInputSchema)
		.mutation(async ({ ctx, input }) => {
			const { data: category, error: categoryError } = await ctx.supabase
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

			await assertKnownLabels(ctx.supabase, input.restaurantId, input.labels);

			const { data, error } = await ctx.supabase
				.from("menu_items")
				.insert({
					restaurant_id: input.restaurantId,
					category_id: input.categoryId,
					name: input.name,
					description: input.description,
					price: input.price,
					prep_time: input.prepTime,
					serving_size: input.servingSize,
					diet: input.diet,
					availability: input.availability,
					labels: [...new Set(input.labels)],
					offers_spice: input.offersSpice,
					offers_salt: input.offersSalt,
					offers_ice: input.offersIce,
					status: input.status,
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
	updateItem: adminProcedure
		.input(menuItemUpdateSchema)
		.mutation(async ({ ctx, input }) => {
			const { data: category, error: categoryError } = await ctx.supabase
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

			await assertKnownLabels(ctx.supabase, input.restaurantId, input.labels);

			const { data, error } = await ctx.supabase
				.from("menu_items")
				.update({
					category_id: input.categoryId,
					name: input.name,
					description: input.description,
					price: input.price,
					prep_time: input.prepTime,
					serving_size: input.servingSize,
					diet: input.diet,
					availability: input.availability,
					labels: [...new Set(input.labels)],
					offers_spice: input.offersSpice,
					offers_salt: input.offersSalt,
					offers_ice: input.offersIce,
					status: input.status,
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
	updateItemState: adminProcedure
		.input(menuItemStateInputSchema)
		.mutation(async ({ ctx, input }) => {
			const changes =
				input.action === "show"
					? { status: "active" as const }
					: input.action === "hide"
						? { status: "archived" as const }
						: input.action === "mark_sold_out"
							? { availability: "sold_out" as const }
							: { availability: "available" as const };

			// Availability only means anything for a dish the guest can see —
			// a hidden dish must be shown again before its availability changes.
			const isAvailabilityAction =
				input.action === "mark_sold_out" || input.action === "mark_available";

			let query = ctx.supabase
				.from("menu_items")
				.update({ ...changes, updated_at: new Date().toISOString() })
				.eq("id", input.itemId)
				.eq("restaurant_id", input.restaurantId);
			if (isAvailabilityAction) {
				query = query.eq("status", "active");
			}

			const { data, error } = await query.select("id").maybeSingle();

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to update the dish.",
					cause: error,
				});
			}

			if (!data) {
				throw new TRPCError({
					code: isAvailabilityAction ? "BAD_REQUEST" : "NOT_FOUND",
					message: isAvailabilityAction
						? "Show this dish before changing its availability."
						: "This dish is no longer available.",
				});
			}

			return data;
		}),
});
