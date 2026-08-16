import type { PostgrestError } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { authedProcedure, router } from "../trpc/init";
import {
	inviteStaffInput,
	listStaffInput,
	removeStaffInput,
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
// Owners") — same pattern as bills.ts's close_session — so error.message is
// passed straight through as BAD_REQUEST rather than collapsed to a generic
// fallback. The one exception is a duplicate-email unique violation (23505),
// which surfaces the underlying index name if shown raw.
function rpcError(error: PostgrestError): TRPCError {
	return new TRPCError({
		code: "BAD_REQUEST",
		message:
			error.code === "23505"
				? "That email is already on the roster."
				: error.message,
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
			.select("id, name, email, role, status, is_primary_owner")
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
});
