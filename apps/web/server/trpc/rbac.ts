import { TRPCError } from "@trpc/server";
import { isDineinlyAdmin, type StaffRole } from "@/lib/auth";
import type { Context } from "./context";

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
