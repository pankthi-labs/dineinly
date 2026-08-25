import { TRPCError } from "@trpc/server";
import type { Database } from "@workspace/db";
import { isDineinlyAdmin, type StaffRole } from "@/lib/auth";
import type { Context } from "./context";
import { dbError } from "./errors";

// Feature-level RBAC for tRPC mutations. requireRestaurantAccess (lib/auth.ts)
// / authedProcedure only prove the caller is active staff at this restaurant
// (or Dineinly Admin) — this narrows further to the specific roles
// docs/product.md's RBAC matrix allows for one action, e.g. "Update Order
// Status" excludes Waiter, "Close Session" excludes Kitchen. Dineinly Admin
// always passes, matching every other admin carve-out in the app.
//
// Menu writes call this too, even though staff_write_menu_items etc.
// (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 5)
// is the real enforcement underneath — this just fails fast with a clear
// error instead of a silent RLS no-op. Table writes stay RLS-only, no
// equivalent router-level check exists yet. See Tbd.md "Feature-level staff
// permissions".
export async function requireStaffRole(
	ctx: Context,
	restaurantId: string,
	allowedRoles: StaffRole[],
): Promise<void> {
	const {
		data: { user },
	} = await ctx.auth.auth.getUser();

	if (isDineinlyAdmin(user)) return;

	const { data: role } = await ctx.auth.rpc("staff_role_for_restaurant", {
		p_restaurant_id: restaurantId,
	});

	if (!role || !allowedRoles.includes(role)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You don't have permission to do this.",
		});
	}
}

// Dineinly Menu (docs/product.md § Dineinly Experiences) is view-only — no
// kitchen, floor, or bills for that package, not merely a permission
// question the caller's role could pass.
export async function assertFullServiceExperience(
	ctx: Context,
	restaurantId: string,
): Promise<Database["public"]["Enums"]["restaurant_experience"] | null> {
	const { data, error } = await ctx.auth
		.from("restaurants")
		.select("experience")
		.eq("id", restaurantId)
		.maybeSingle();

	if (error) {
		throw dbError("Unable to verify this restaurant's package.", error);
	}
	if (data?.experience === "menu") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "This feature isn't available on the Dineinly Menu package.",
		});
	}
	return data?.experience ?? null;
}

// Returns the restaurant's experience so callers that also need it (e.g.
// kitchen.ts's counter-bill gate) don't re-fetch it themselves.
export async function requireFullServiceRole(
	ctx: Context,
	restaurantId: string,
	allowedRoles: StaffRole[],
): Promise<Database["public"]["Enums"]["restaurant_experience"] | null> {
	const [, experience] = await Promise.all([
		requireStaffRole(ctx, restaurantId, allowedRoles),
		assertFullServiceExperience(ctx, restaurantId),
	]);
	return experience;
}

// Menu and Counter seat no one at physical tables (docs/product.md §
// Dineinly Experiences — Menu is view-only, Counter has zero Restaurant
// Table rows) — Floor (Order on behalf of guest, Merge Tables) isn't a
// permission question the caller's role could pass for either package,
// unlike assertFullServiceExperience above which only excludes Menu
// (Counter still has Kitchen and Bills).
export async function assertSeatedExperience(
	ctx: Context,
	restaurantId: string,
): Promise<Database["public"]["Enums"]["restaurant_experience"] | null> {
	const { data, error } = await ctx.auth
		.from("restaurants")
		.select("experience")
		.eq("id", restaurantId)
		.maybeSingle();

	if (error) {
		throw dbError("Unable to verify this restaurant's package.", error);
	}
	if (data?.experience === "menu" || data?.experience === "counter") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "This feature isn't available on this restaurant's package.",
		});
	}
	return data?.experience ?? null;
}

export async function requireSeatedRole(
	ctx: Context,
	restaurantId: string,
	allowedRoles: StaffRole[],
): Promise<Database["public"]["Enums"]["restaurant_experience"] | null> {
	const [, experience] = await Promise.all([
		requireStaffRole(ctx, restaurantId, allowedRoles),
		assertSeatedExperience(ctx, restaurantId),
	]);
	return experience;
}
