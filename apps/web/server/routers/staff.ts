import type { PostgrestError } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { authedProcedure, router } from "../trpc/init";
import {
	adminResetPinInput,
	inviteStaffInput,
	listStaffInput,
	myProfileInput,
	reassignOwnerInput,
	removeStaffInput,
	resendInviteInput,
	setPinInput,
	updateOwnProfileInput,
	updateStaffInput,
} from "./staff.schema";

function listError(error: PostgrestError): TRPCError {
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "Unable to load the staff roster.",
		cause: error,
	});
}

// invite_staff/update_staff/remove_staff raise their own clean, user-facing
// text for every business-rule rejection (e.g. "Managers may not invite
// Owners") via plpgsql `raise exception`, which always carries SQLSTATE
// P0001 — same pattern as bills.ts's close_session — so that message is
// passed straight through as BAD_REQUEST. Any other code is a raw Postgres
// error (constraint violation, ambiguous reference, etc.), never meant for
// a user to read, and collapses to a generic fallback — 23505 gets its own
// specific text since duplicate email is the one raw case worth naming.
function rpcError(error: PostgrestError): TRPCError {
	if (error.code === "23505") {
		return new TRPCError({
			code: "BAD_REQUEST",
			message: "That email is already on the roster.",
			cause: error,
		});
	}
	if (error.code === "P0001") {
		return new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
			cause: error,
		});
	}
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "Something went wrong. Please try again.",
		cause: error,
	});
}

// authedProcedure — real authorization lives server-side, in Postgres:
// staff_roster_select (read) and invite_staff/update_staff/remove_staff
// (write), all in supabase/migrations/20260816164344_add_staff_roster_rpcs.sql.
// A Waiter/Kitchen caller reaches these procedures too, but RLS and the
// RPCs' own role checks do the real enforcement, matching every other router
// in this app: list returns only their own row (staff_select_own_row, the
// pre-existing per-caller policy every staff role has always had), never the
// full roster, and every write raises.
export const staffRouter = router({
	list: authedProcedure.input(listStaffInput).query(async ({ ctx, input }) => {
		const { data, error } = await ctx.auth
			.from("staff")
			.select("id, name, email, role, status, invited_at, is_primary_owner")
			.eq("restaurant_id", input.restaurantId)
			.order("name", { ascending: true });

		if (error) {
			throw listError(error);
		}

		return data;
	}),

	invite: authedProcedure
		.input(inviteStaffInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("invite_staff", {
				p_restaurant_id: input.restaurantId,
				p_name: input.name,
				p_email: input.email,
				p_role: input.role,
			});

			if (error) {
				throw rpcError(error);
			}

			return data[0];
		}),

	update: authedProcedure
		.input(updateStaffInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("update_staff", {
				p_staff_id: input.id,
				p_name: input.name,
				p_email: input.email,
				p_role: input.role,
			});

			if (error) {
				throw rpcError(error);
			}

			return data[0];
		}),

	remove: authedProcedure
		.input(removeStaffInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("remove_staff", {
				p_staff_id: input.id,
			});

			if (error) {
				throw rpcError(error);
			}

			return data[0];
		}),

	// Restarts an invited row's 24h sign-in window (resend_staff_invite,
	// supabase/migrations/20260816164344_add_staff_roster_rpcs.sql § 15).
	// Same auth reach as invite: Admin, or an Owner/Manager who isn't
	// resending an Owner's invite as a Manager.
	resendInvite: authedProcedure
		.input(resendInviteInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("resend_staff_invite", {
				p_staff_id: input.id,
			});

			if (error) {
				throw rpcError(error);
			}

			return data[0];
		}),

	// Owner reassignment (Tbd.md "Owner reassignment"): hands is_primary_owner
	// to another existing Owner-role staff row, atomically — a pure handoff,
	// not a demotion (both stay role = 'owner') — reassign_primary_owner
	// (supabase/migrations/20260816164344_add_staff_roster_rpcs.sql § 15c).
	// Current primary owner/Admin only, enforced in the RPC itself.
	reassignOwner: authedProcedure
		.input(reassignOwnerInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("reassign_primary_owner", {
				p_restaurant_id: input.restaurantId,
				p_new_owner_staff_id: input.newOwnerStaffId,
			});

			if (error) {
				throw rpcError(error);
			}

			return data[0];
		}),

	// Self-service PIN set/change (Tbd.md "PIN station login" — the storage
	// half only). set_staff_pin scopes to the caller's own row via
	// auth.uid(), so no staff id is ever passed — a caller can only ever set
	// their own PIN.
	setPin: authedProcedure
		.input(setPinInput)
		.mutation(async ({ ctx, input }) => {
			const { error } = await ctx.auth.rpc("set_staff_pin", {
				p_restaurant_id: input.restaurantId,
				p_pin: input.pin,
			});

			if (error) {
				throw rpcError(error);
			}

			return { success: true };
		}),

	// Caller's own name + whether they already have a PIN (never the hash
	// itself) — backs the Profile sheet. Filters on user_id explicitly (not
	// just RLS): staff_roster_select (§ 15) gives an Owner/Manager caller
	// visibility into every row at the restaurant, so without this filter
	// .maybeSingle() would error on a roster with more than one active
	// member instead of resolving to their own.
	myProfile: authedProcedure
		.input(myProfileInput)
		.query(async ({ ctx, input }) => {
			const {
				data: { user },
			} = await ctx.auth.auth.getUser();

			if (!user) {
				return null;
			}

			const { data, error } = await ctx.auth
				.from("staff")
				.select("name, email, pin_hash")
				.eq("restaurant_id", input.restaurantId)
				.eq("user_id", user.id)
				.eq("status", "active")
				.maybeSingle();

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to load your profile.",
					cause: error,
				});
			}
			if (!data) {
				return null;
			}

			return {
				name: data.name,
				email: data.email,
				hasPin: data.pin_hash != null,
			};
		}),

	// Self-service profile edit: a staff member's own name. update_own_staff_profile
	// scopes to the caller's own row via auth.uid() — no staff id is ever
	// passed, same reasoning as setPin.
	updateOwnProfile: authedProcedure
		.input(updateOwnProfileInput)
		.mutation(async ({ ctx, input }) => {
			const { error } = await ctx.auth.rpc("update_own_staff_profile", {
				p_restaurant_id: input.restaurantId,
				p_name: input.name,
			});

			if (error) {
				throw rpcError(error);
			}

			return { success: true };
		}),

	// Dineinly Admin override: reset any staff member's PIN. Admin-only,
	// enforced in admin_reset_staff_pin itself.
	adminResetPin: authedProcedure
		.input(adminResetPinInput)
		.mutation(async ({ ctx, input }) => {
			const { error } = await ctx.auth.rpc("admin_reset_staff_pin", {
				p_staff_id: input.staffId,
				p_pin: input.pin,
			});

			if (error) {
				throw rpcError(error);
			}

			return { success: true };
		}),
});
