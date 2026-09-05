import { TRPCError } from "@trpc/server";
import type { Database } from "@workspace/db";
import { isDineinlyAdmin, type StaffRole } from "@/lib/auth";
import { STATION_EMAIL_SUFFIX } from "@/lib/station-session";
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
	allowedRoles: readonly StaffRole[],
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

	// A named Waiter's own OTP session is excluded even where 'waiter' is
	// allowed above — Kitchen/Floor/Bills mutations are a paired station's
	// job, or Manager/Owner's (docs/architecture.md § Station Account
	// Provisioning). The station device's own Staff row also resolves role
	// 'waiter', so email suffix is the only way to tell them apart.
	if (role === "waiter") {
		const { data: staffRow } = await ctx.auth
			.from("staff")
			.select("email")
			.eq("restaurant_id", restaurantId)
			.eq("user_id", user?.id ?? "")
			.eq("status", "active")
			.maybeSingle();

		if (!staffRow?.email.endsWith(STATION_EMAIL_SUFFIX)) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You don't have permission to do this.",
			});
		}

		// A station device's PIN cookie is what turns the shared identity into
		// a specific, attributable person — a freshly paired (or since-expired)
		// device with no PIN entered may not act at all, same posture as
		// requireOwnStaffId (floor.ts) already enforces for cart/order writes.
		if (
			!ctx.stationSession ||
			ctx.stationSession.restaurantId !== restaurantId
		) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "Enter your PIN to continue.",
			});
		}

		// Revocation is a server-side boundary, not just the Floor page's
		// sign-out-and-redirect: a revoked tablet must stop mutating even if it
		// never re-renders. The device id comes from a signed cookie
		// (lib/station-session.ts), so a device can't rename itself out of a
		// revocation. Same check and message as requireOwnStaffId (floor.ts).
		if (ctx.stationDeviceId) {
			const { data: revoked, error: revokedError } = await ctx.auth.rpc(
				"is_station_device_revoked",
				{ p_device_id: ctx.stationDeviceId },
			);
			if (revokedError) {
				throw dbError("Unable to verify this device.", revokedError);
			}
			if (revoked) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "This device was removed. Pair it again.",
				});
			}
		}
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

export async function requireIntegratedServiceRole(
	ctx: Context,
	restaurantId: string,
	allowedRoles: StaffRole[],
): Promise<Database["public"]["Enums"]["restaurant_experience"] | null> {
	const [, experience] = await Promise.all([
		requireStaffRole(ctx, restaurantId, allowedRoles),
		assertFullServiceExperience(ctx, restaurantId),
	]);
	if (experience !== "one" && experience !== "counter") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "This feature isn't available on the Dineinly Guest package.",
		});
	}
	return experience;
}

export async function assertIntegratedServiceExperience(
	ctx: Context,
	restaurantId: string,
): Promise<Database["public"]["Enums"]["restaurant_experience"] | null> {
	const experience = await assertFullServiceExperience(ctx, restaurantId);
	if (experience !== "one" && experience !== "counter") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "This feature isn't available on the Dineinly Guest package.",
		});
	}
	return experience;
}
