import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../trpc/init";

const restaurantIdSchema = z.string().uuid();
const menuCategoryInputSchema = z.object({
	restaurantId: restaurantIdSchema,
	name: z.string().trim().min(1),
	taxRate: z.number().finite().min(0).max(1),
});
const menuItemInputSchema = z.object({
	restaurantId: restaurantIdSchema,
	categoryId: z.string().uuid(),
	name: z.string().trim().min(1),
	description: z.string().trim().min(1),
	price: z.number().finite().nonnegative(),
	prepTime: z.number().int().positive(),
	servingSize: z.string().trim().min(1),
	diet: z.enum(["veg", "non_veg"]),
	availability: z.enum(["available", "sold_out"]),
	labels: z.array(z.string().trim().min(1)),
	spice: z.enum(["mild", "regular", "extra spicy"]).nullable(),
	salt: z.enum(["less salt", "regular"]).nullable(),
	ice: z.enum(["none", "less", "regular"]).nullable(),
	status: z.enum(["active", "archived"]),
});
const menuItemUpdateSchema = menuItemInputSchema.extend({
	itemId: z.string().uuid(),
});
const menuItemStateInputSchema = z.object({
	restaurantId: restaurantIdSchema,
	itemId: z.string().uuid(),
	action: z.enum(["hide", "show", "mark_sold_out", "mark_available", "delete"]),
});

// The management view intentionally includes archived categories and items so
// an administrator can see the complete restaurant catalog. Guest-facing menu
// queries remain limited by their separate active-only RLS policies.
export const menuRouter = router({
	listForManagement: adminProcedure
		.input(z.object({ restaurantId: restaurantIdSchema }))
		.query(async ({ ctx, input }) => {
			const [restaurantResult, categoriesResult, itemsResult] =
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
							"id, category_id, name, description, price, prep_time, serving_size, diet, availability, labels, spice, salt, ice, status",
						)
						.eq("restaurant_id", input.restaurantId)
						.order("name", { ascending: true }),
				]);

			for (const result of [restaurantResult, categoriesResult, itemsResult]) {
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
					spice: input.spice,
					salt: input.salt,
					ice: input.ice,
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
					spice: input.spice,
					salt: input.salt,
					ice: input.ice,
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
					: input.action === "mark_sold_out"
						? { availability: "sold_out" as const }
						: input.action === "mark_available"
							? { availability: "available" as const }
							: { status: "archived" as const };

			const { data, error } = await ctx.supabase
				.from("menu_items")
				.update({ ...changes, updated_at: new Date().toISOString() })
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
