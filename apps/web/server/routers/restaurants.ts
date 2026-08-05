import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../trpc/init";
import {
	createRestaurantInput,
	listRestaurantsInput,
	setRestaurantStatusInput,
	updateRestaurantInput,
} from "./restaurants.schema";

type PrimaryOwnerRow = {
	id: string;
	name: string | null;
	email: string;
	mobile: string | null;
	status: "invited" | "active" | "removed";
};

function toServiceChargePercent(rate: number | null): number | null {
	return rate === null ? null : Math.round(rate * 10000) / 100;
}

function toServiceChargeRate(percent: number | null): number | null {
	return percent === null ? null : percent / 100;
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
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error.message,
				});
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
						serviceChargePercent: toServiceChargePercent(
							row.service_charge_rate,
						),
						status: row.status,
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

	create: adminProcedure
		.input(createRestaurantInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("admin_create_restaurant", {
				p_name: input.name,
				p_address: input.address,
				p_city: input.city,
				p_gst_number: input.gstNumber,
				p_state: input.state,
				p_pincode: input.pincode,
				// numeric SQL params generate as non-nullable in database.types.ts —
				// the column itself (restaurants.service_charge_rate) is nullable.
				p_service_charge_rate: toServiceChargeRate(
					input.serviceChargePercent,
				) as number,
				p_owner_name: input.ownerName,
				p_owner_email: input.ownerEmail,
				p_owner_mobile: input.ownerMobile,
			});

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error.message,
				});
			}

			return data[0];
		}),

	update: adminProcedure
		.input(updateRestaurantInput)
		.mutation(async ({ ctx, input }) => {
			// Atomic — see admin_update_restaurant (supabase/migrations/
			// 20260803044818_admin_update_restaurant_rpc.sql) for the
			// restaurant+staff write and the "primary owner locked once active"
			// rule, same pattern as create above.
			const { data, error } = await ctx.auth.rpc("admin_update_restaurant", {
				p_id: input.id,
				p_name: input.name,
				p_address: input.address,
				p_city: input.city,
				p_gst_number: input.gstNumber,
				p_state: input.state,
				p_pincode: input.pincode,
				p_service_charge_rate: toServiceChargeRate(
					input.serviceChargePercent,
				) as number,
				p_owner_name: input.ownerName,
				p_owner_email: input.ownerEmail,
				p_owner_mobile: input.ownerMobile,
			});

			if (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error.message,
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
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error.message,
				});
			}

			return { id: input.id, status: input.status };
		}),
});
