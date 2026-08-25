import type { PostgrestError } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { isDineinlyAdmin } from "@/lib/auth";
import { buildTableQrPdf } from "@/lib/qr-pdf";
import { adminProcedure, authedProcedure, router } from "../trpc/init";
import {
	createRestaurantInput,
	downloadQrPdfInput,
	getQrInput,
	getRestaurantInput,
	listRestaurantsInput,
	setRestaurantStatusInput,
	updateOwnRestaurantInput,
	updateRestaurantInput,
} from "./restaurants.schema";

// Never surface a raw Postgres/RPC error string to the admin — it can leak
// column/constraint names and other schema detail. `cause` keeps the
// original error attached for server-side logs without exposing it
// client-side; the client only ever sees `message`.
function toTRPCError(error: PostgrestError, fallback: string): TRPCError {
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message:
			error.code === "23505" ? "That value is already in use." : fallback,
		cause: error,
	});
}

type PrimaryOwnerRow = {
	id: string;
	name: string | null;
	email: string;
	mobile: string | null;
	status: "invited" | "active" | "removed";
};

// ownerMobile is optional (see restaurants.schema.ts) — an empty string is
// "not provided", stored as null (staff.mobile is nullable), not as "".
function toOwnerMobile(mobile: string): string | null {
	return mobile === "" ? null : mobile;
}

// address/city/gstNumber/state/pincode are only required on One/Counter
// (restaurantFieldsSchema's refineBillingDetails) — Menu/Guest leave them
// blank in the form, stored as null (the columns are nullable), not as "".
function nullIfEmpty(value: string): string | null {
	return value === "" ? null : value;
}

export const restaurantsRouter = router({
	list: adminProcedure
		.input(listRestaurantsInput)
		.query(async ({ ctx, input }) => {
			const { page, pageSize, search } = input;
			const from = (page - 1) * pageSize;
			const to = from + pageSize - 1;

			let query = ctx.auth
				.from("restaurants")
				.select("*, staff(id, name, email, mobile, status, is_primary_owner)", {
					count: "exact",
				})
				// Default (non-inner) embed filter: narrows the nested `staff`
				// array to the primary owner without excluding restaurants that
				// don't have one yet (that would need `staff!inner`).
				.eq("staff.is_primary_owner", true)
				// restaurant_status is declared active-then-archived (packages/db/
				// src/schema/enums.ts), so ascending sorts live restaurants first
				// by Postgres enum ordinal — paused ones always trail. Name breaks
				// ties within each group.
				.order("status", { ascending: true })
				.order("name", { ascending: true })
				.range(from, to);

			if (search) {
				query = query.ilike("name", `%${search}%`);
			}

			const { data, error, count } = await query;

			if (error) {
				throw toTRPCError(error, "Unable to load restaurants.");
			}

			return {
				items: (data ?? []).map((row) => {
					const primaryOwner = (row.staff as PrimaryOwnerRow[])[0] ?? null;
					return {
						id: row.id,
						name: row.name,
						address: row.address,
						city: row.city,
						gstNumber: row.gst_number,
						state: row.state,
						pincode: row.pincode,
						status: row.status,
						experience: row.experience,
						owner: primaryOwner
							? {
									staffId: primaryOwner.id,
									name: primaryOwner.name,
									email: primaryOwner.email,
									mobile: primaryOwner.mobile,
									status: primaryOwner.status,
								}
							: null,
					};
				}),
				total: count ?? 0,
				page,
				pageSize,
			};
		}),

	// Restaurant name for the restaurant home page's header. authedProcedure,
	// not adminProcedure — every restaurant's own staff needs this too;
	// staff_select_own_restaurant RLS (supabase/migrations/
	// 20260730150634_add_auth_fk_and_rls_policies.sql § 5) is what actually
	// keeps a staff caller from reading another restaurant's row.
	getById: authedProcedure
		.input(getRestaurantInput)
		.query(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth
				.from("restaurants")
				.select("id, name, status")
				.eq("id", input.id)
				.maybeSingle();

			if (error) {
				throw toTRPCError(error, "Unable to load the restaurant.");
			}
			if (!data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Restaurant not found.",
				});
			}

			return data;
		}),

	// Venue Settings read (docs/product.md § RBAC "Restaurant Settings" —
	// Owner + Dineinly Admin only, unlike getById's plain name/status which
	// every staff role may see). staff_select_own_restaurant RLS (supabase/
	// migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 5) grants
	// every active staff row-level SELECT regardless of role, so — unlike
	// getById — the role check has to happen here, not just in the
	// settings/layout.tsx page gate a caller could bypass by hitting this
	// procedure directly.
	getSettings: authedProcedure
		.input(getRestaurantInput)
		.query(async ({ ctx, input }) => {
			const {
				data: { user },
			} = await ctx.auth.auth.getUser();

			if (!isDineinlyAdmin(user)) {
				const { data: role } = await ctx.auth.rpc("staff_role_for_restaurant", {
					p_restaurant_id: input.id,
				});
				if (role !== "owner") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Only the restaurant owner may view these settings.",
					});
				}
			}

			const { data, error } = await ctx.auth
				.from("restaurants")
				.select(
					"id, name, address, city, gst_number, state, pincode, experience",
				)
				.eq("id", input.id)
				.maybeSingle();

			if (error) {
				throw toTRPCError(error, "Unable to load the restaurant.");
			}
			if (!data) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Restaurant not found.",
				});
			}

			return {
				id: data.id,
				name: data.name,
				address: data.address,
				city: data.city,
				gstNumber: data.gst_number,
				state: data.state,
				pincode: data.pincode,
				experience: data.experience,
			};
		}),

	create: adminProcedure
		.input(createRestaurantInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("admin_create_restaurant", {
				p_name: input.name,
				// Non-nullable-in-generated-types situation — the columns
				// themselves are nullable.
				p_address: nullIfEmpty(input.address) as string,
				p_city: nullIfEmpty(input.city) as string,
				p_gst_number: nullIfEmpty(input.gstNumber) as string,
				p_state: nullIfEmpty(input.state) as string,
				p_pincode: nullIfEmpty(input.pincode) as string,
				p_experience: input.experience,
				p_owner_name: input.ownerName,
				p_owner_email: input.ownerEmail,
				// Same non-nullable-in-generated-types situation as above —
				// staff.mobile is nullable.
				p_owner_mobile: toOwnerMobile(input.ownerMobile) as string,
			});

			if (error) {
				throw toTRPCError(error, "Unable to create the restaurant.");
			}

			return data[0];
		}),

	update: adminProcedure
		.input(updateRestaurantInput)
		.mutation(async ({ ctx, input }) => {
			// Atomic — see admin_update_restaurant (supabase/migrations/
			// 20260730150634_add_auth_fk_and_rls_policies.sql § 6) for the
			// restaurant+staff write and the "primary owner locked once active"
			// rule, same pattern as create above.
			const { data, error } = await ctx.auth.rpc("admin_update_restaurant", {
				p_id: input.id,
				p_name: input.name,
				// Non-nullable-in-generated-types situation — the columns
				// themselves are nullable.
				p_address: nullIfEmpty(input.address) as string,
				p_city: nullIfEmpty(input.city) as string,
				p_gst_number: nullIfEmpty(input.gstNumber) as string,
				p_state: nullIfEmpty(input.state) as string,
				p_pincode: nullIfEmpty(input.pincode) as string,
				p_experience: input.experience,
				p_owner_name: input.ownerName,
				p_owner_email: input.ownerEmail,
				p_owner_mobile: toOwnerMobile(input.ownerMobile) as string,
			});

			if (error) {
				throw toTRPCError(error, "Unable to save the restaurant.");
			}

			return { id: data };
		}),

	// Venue Settings write. authedProcedure — owner_update_restaurant
	// (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql)
	// does the real authorization check (Owner-role staff or Dineinly
	// Admin), same pattern as staff.ts's self-service procedures.
	updateOwn: authedProcedure
		.input(updateOwnRestaurantInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("owner_update_restaurant", {
				p_id: input.id,
				p_name: input.name,
				// Non-nullable-in-generated-types situation — the columns
				// themselves are nullable.
				p_address: nullIfEmpty(input.address) as string,
				p_city: nullIfEmpty(input.city) as string,
				p_gst_number: nullIfEmpty(input.gstNumber) as string,
				p_state: nullIfEmpty(input.state) as string,
				p_pincode: nullIfEmpty(input.pincode) as string,
				p_experience: input.experience,
			});

			if (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error.message,
					cause: error,
				});
			}

			return { id: data };
		}),

	setStatus: adminProcedure
		.input(setRestaurantStatusInput)
		.mutation(async ({ ctx, input }) => {
			const { error } = await ctx.auth
				.from("restaurants")
				.update({ status: input.status })
				.eq("id", input.id);

			if (error) {
				throw toTRPCError(error, "Unable to update the restaurant status.");
			}

			return { id: input.id, status: input.status };
		}),

	// Menu and Counter share one restaurant-level universal QR — neither has
	// a Table Matrix (docs/product.md § Dineinly Experiences), so this is the
	// Owner's only QR for either package. Read + regenerate/download reuse
	// the Owner+Admin gate every other Venue Settings write uses (RLS:
	// staff_select_own_restaurant lets any staff read; the role check below
	// narrows to Owner, matching getSettings above) — this is Venue Settings
	// surface, not the broader authedProcedure reach tables.ts uses.
	qr: router({
		get: authedProcedure.input(getQrInput).query(async ({ ctx, input }) => {
			const {
				data: { user },
			} = await ctx.auth.auth.getUser();

			if (!isDineinlyAdmin(user)) {
				const { data: role } = await ctx.auth.rpc("staff_role_for_restaurant", {
					p_restaurant_id: input.restaurantId,
				});
				if (role !== "owner") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Only the restaurant owner may view this QR code.",
					});
				}
			}

			const { data, error } = await ctx.auth
				.from("restaurants")
				.select("qr_token")
				.eq("id", input.restaurantId)
				.maybeSingle();

			if (error) {
				throw toTRPCError(error, "Unable to load the QR code.");
			}

			return { qrToken: data?.qr_token ?? null };
		}),

		// Rotates the token in place — same "old printed QR stops working
		// immediately" behavior as tables.regenerateQr (docs/product.md §
		// Onboarding & Setup). Delegates to regenerate_qr_token() (SECURITY
		// DEFINER) rather than a direct table update: restaurants only grants
		// Owners row-level SELECT via RLS (staff_select_own_restaurant), not
		// UPDATE — same reasoning as owner_update_restaurant, see that RPC's
		// comment in the migration. For Menu restaurants this also closes
		// every active guest session (see regenerate_qr_token's comment);
		// Counter sessions are left running since they can carry a real
		// order/bill a regenerate shouldn't strand.
		regenerate: authedProcedure
			.input(getQrInput)
			.mutation(async ({ ctx, input }) => {
				const { data, error } = await ctx.auth.rpc("regenerate_qr_token", {
					p_restaurant_id: input.restaurantId,
				});

				if (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: error.message,
						cause: error,
					});
				}

				return { qrToken: data };
			}),

		downloadPdf: authedProcedure
			.input(downloadQrPdfInput)
			.query(async ({ ctx, input }) => {
				const { data, error } = await ctx.auth
					.from("restaurants")
					.select("name, qr_token, experience")
					.eq("id", input.restaurantId)
					.maybeSingle();

				if (error) {
					throw toTRPCError(error, "Unable to load the restaurant.");
				}
				if (!data?.qr_token) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "No QR code for this restaurant.",
					});
				}

				const label = data.experience === "counter" ? "Counter" : "Menu";
				const pdf = await buildTableQrPdf(
					[{ label, qrToken: data.qr_token }],
					input.origin,
				);

				return {
					fileName: `${data.name.replace(/[^a-zA-Z0-9-]+/g, "-")}-${label.toLowerCase()}-qr.pdf`,
					base64: Buffer.from(pdf).toString("base64"),
				};
			}),
	}),
});
