import { TRPCError } from "@trpc/server";
import { guestProcedure, router } from "../trpc/init";

// Guest-facing reads only. RLS (guest_select_own_restaurant,
// guest_select_active_menu_categories/items — supabase/migrations/
// 20260730150634_..._policies.sql § 3) already scopes every query below to
// this guest's own restaurant and to active-status rows; sold-out items
// still return (docs/product.md: sold-out must still show, just marked
// unavailable), so no availability filter here either.
export const guestRouter = router({
	menu: guestProcedure.query(async ({ ctx }) => {
		const [restaurantResult, categoriesResult, itemsResult] = await Promise.all(
			[
				ctx.supabase
					.from("restaurants")
					.select("name")
					.eq("id", ctx.guest.restaurant_id)
					.maybeSingle(),
				ctx.supabase
					.from("menu_categories")
					.select("id, name, sort")
					.eq("restaurant_id", ctx.guest.restaurant_id)
					.order("sort", { ascending: true }),
				ctx.supabase
					.from("menu_items")
					.select(
						"id, category_id, name, description, price, diet, availability, labels, prep_time, serving_size, offers_spice, offers_salt, offers_ice",
					)
					.eq("restaurant_id", ctx.guest.restaurant_id)
					.order("name", { ascending: true }),
			],
		);

		for (const result of [restaurantResult, categoriesResult, itemsResult]) {
			if (result.error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to load the menu.",
					cause: result.error,
				});
			}
		}

		if (!restaurantResult.data) {
			return null;
		}

		const items = itemsResult.data ?? [];

		return {
			restaurant: restaurantResult.data,
			tableLabel: ctx.guest.table_label,
			categories: (categoriesResult.data ?? []).map((category) => ({
				...category,
				items: items.filter((item) => item.category_id === category.id),
			})),
		};
	}),
});
