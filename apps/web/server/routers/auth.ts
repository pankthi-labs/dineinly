import { TRPCError } from "@trpc/server";
import { authedProcedure, publicProcedure, router } from "../trpc/init";
import { resolveSignInInput, updateDisplayNameInput } from "./auth.schema";

// Staff auth flow: the sign-in gate (before OTP is sent) and the
// post-verify link-up (right after it's confirmed). See
// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 10 for the two
// Postgres functions this router wraps — both SECURITY DEFINER, since an
// unauthenticated sign-in check and a not-yet-linked Staff row are exactly
// the cases Staff RLS (deferred, see AGENTS.md guardrails) can't cover yet.
export const authRouter = router({
	// Called from the sign-in page before signInWithOtp. Decides whether
	// GoTrue may create the auth.users row on first verify (an invited
	// Staff row) or must not (anything else) — never open self-signup.
	// Returns only this one boolean, not whether the email matches an
	// existing account: an "unknown vs existing" distinction here would let
	// an unauthenticated caller enumerate registered emails. The client
	// always proceeds to signInWithOtp with this flag either way.
	resolveSignIn: publicProcedure
		.input(resolveSignInInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("resolve_staff_signin", {
				p_email: input.email,
			});

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error.message,
				});
			}

			return { shouldCreateUser: data };
		}),

	// Called right after verifyOtp() succeeds. Links the caller's own
	// invited Staff row(s) to their new auth.users identity and copies
	// their name into user_metadata.display_name, which getViewer()
	// (apps/web/lib/auth.ts) already reads.
	linkStaffAccount: publicProcedure.mutation(async ({ ctx }) => {
		// No separate getUser() precheck: link_staff_account() itself raises
		// when there's no session, so a second round trip just to ask the
		// same question first would be pure waste.
		const { data, error } = await ctx.auth.rpc("link_staff_account");

		if (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: error.message,
			});
		}

		const displayName = data.find((row) => row.name)?.name;
		if (displayName) {
			await ctx.auth.auth.updateUser({ data: { display_name: displayName } });
		}

		return {
			linked: data.map((row) => ({
				restaurantId: row.restaurant_id,
				staffId: row.staff_id,
				role: row.role,
			})),
		};
	}),

	// Dineinly Admin's self-service name — Admin has no Staff row anywhere
	// (RestaurantAccess.restaurantRole is null for them), so the Profile
	// sheet's staff-backed name/PIN endpoints don't apply; this is their own
	// equivalent, backed by the same user_metadata.display_name field
	// getViewer() (apps/web/lib/auth.ts) already reads for the greeting.
	me: authedProcedure.query(async ({ ctx }) => {
		const {
			data: { user },
		} = await ctx.auth.auth.getUser();

		return {
			id: user?.id ?? "",
			displayName: user?.user_metadata?.display_name ?? null,
			email: user?.email ?? "",
		};
	}),

	updateDisplayName: authedProcedure
		.input(updateDisplayNameInput)
		.mutation(async ({ ctx, input }) => {
			const { error } = await ctx.auth.auth.updateUser({
				data: { display_name: input.name },
			});

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error.message,
				});
			}

			return { success: true };
		}),
});
