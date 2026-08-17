import type { SupabaseClient, User } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { isDineinlyAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminProcedure, router } from "../trpc/init";
import {
	inviteAdminStaffInput,
	removeAdminStaffInput,
	updateAdminStaffInput,
} from "./admin-staff.schema";

const LIST_PAGE_SIZE = 50;

// auth.admin.listUsers() has no server-side filter for app_metadata, so this
// pages through every Supabase Auth user and filters in memory. Fine for a
// platform-internal admin headcount (single/low-digit team, not tenant
// staff) — see docs/core-data-model.md, Admin deliberately has no table.
async function listDineinlyAdmins(
	adminClient: SupabaseClient,
): Promise<User[]> {
	const admins: User[] = [];
	for (let page = 1; ; page++) {
		const { data, error } = await adminClient.auth.admin.listUsers({
			page,
			perPage: LIST_PAGE_SIZE,
		});
		if (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Unable to load Dineinly Staff.",
				cause: error,
			});
		}
		admins.push(...data.users.filter(isDineinlyAdmin));
		if (data.users.length < LIST_PAGE_SIZE) break;
	}
	return admins;
}

async function getAdmin(
	adminClient: SupabaseClient,
	id: string,
): Promise<User> {
	const { data, error } = await adminClient.auth.admin.getUserById(id);
	if (error || !data.user || !isDineinlyAdmin(data.user)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "That Dineinly Admin no longer exists.",
		});
	}
	return data.user;
}

function toDisplay(user: User) {
	return {
		id: user.id,
		name: (user.user_metadata?.display_name as string | undefined) ?? null,
		email: user.email ?? "",
	};
}

// adminProcedure only — every call below uses the service-role client, which
// bypasses RLS entirely, so the admin check here IS the authorization, not a
// UX nicety on top of RLS the way staff.ts's RPCs are.
export const adminStaffRouter = router({
	list: adminProcedure.query(async () => {
		const adminClient = createAdminClient();
		const admins = await listDineinlyAdmins(adminClient);
		return admins
			.map(toDisplay)
			.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
	}),

	invite: adminProcedure
		.input(inviteAdminStaffInput)
		.mutation(async ({ input }) => {
			const adminClient = createAdminClient();
			const { data, error } = await adminClient.auth.admin.createUser({
				email: input.email,
				email_confirm: true,
				user_metadata: { display_name: input.name },
				app_metadata: { app_role: "dineinly_admin" },
			});

			if (error || !data.user) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error?.message.toLowerCase().includes("already")
						? "That email is already registered."
						: (error?.message ?? "Unable to invite that admin."),
					cause: error ?? undefined,
				});
			}

			return toDisplay(data.user);
		}),

	update: adminProcedure
		.input(updateAdminStaffInput)
		.mutation(async ({ input }) => {
			const adminClient = createAdminClient();
			await getAdmin(adminClient, input.id);

			const { data, error } = await adminClient.auth.admin.updateUserById(
				input.id,
				{ user_metadata: { display_name: input.name } },
			);

			if (error || !data.user) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to save that admin.",
					cause: error,
				});
			}

			return toDisplay(data.user);
		}),

	remove: adminProcedure
		.input(removeAdminStaffInput)
		.mutation(async ({ ctx, input }) => {
			const {
				data: { user: caller },
			} = await ctx.auth.auth.getUser();

			if (caller?.id === input.id) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "You can't remove your own admin access.",
				});
			}

			const adminClient = createAdminClient();
			const admins = await listDineinlyAdmins(adminClient);

			if (!admins.some((admin) => admin.id === input.id)) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "That Dineinly Admin no longer exists.",
				});
			}
			if (admins.length <= 1) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "At least one Dineinly Admin must remain.",
				});
			}

			const { error } = await adminClient.auth.admin.updateUserById(input.id, {
				app_metadata: { app_role: null },
			});

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Unable to remove that admin.",
					cause: error,
				});
			}

			return { success: true };
		}),
});
