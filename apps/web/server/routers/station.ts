import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authedProcedure, publicProcedure, router } from "../trpc/init";
import { requireStaffRole } from "../trpc/rbac";
import {
	generatePairingCodeInput,
	listDevicesInput,
	redeemPairingCodeInput,
	revokeDeviceInput,
} from "./station.schema";

function dbError(message: string, cause: unknown): TRPCError {
	return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause });
}

// Synthetic identity per restaurant per station type (docs/architecture.md
// § Station Account Provisioning) — unroutable, exists only to satisfy
// Supabase Auth's unique-email requirement. Nothing is ever sent to it.
function stationEmail(restaurantId: string, stationType: "waiter"): string {
	return `${stationType}-${restaurantId}@stations.dineinly.internal`;
}

export const stationRouter = router({
	// Owner/Manager, from Staff Roster. Returns the plaintext code once —
	// only its hash is ever persisted (generate_pairing_code, supabase/
	// migrations).
	generatePairingCode: authedProcedure
		.input(generatePairingCodeInput)
		.mutation(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			const { data, error } = await ctx.auth.rpc("generate_pairing_code", {
				p_restaurant_id: input.restaurantId,
				p_station_type: input.stationType,
			});
			if (error || !data?.[0]) {
				throw dbError("Unable to generate a pairing code.", error);
			}
			return { code: data[0].code, expiresAt: data[0].expires_at };
		}),

	// Called by an unauthenticated device from /station/pair. Burns the
	// code, lazily provisions the station's auth.users + Staff row on this
	// restaurant's first-ever pairing (idempotent on the synthetic email),
	// then mints a magic-link token the *client* exchanges itself via
	// supabase.auth.verifyOtp() — this server never touches a station
	// password.
	redeemPairingCode: publicProcedure
		.input(redeemPairingCodeInput)
		.mutation(async ({ ctx, input }) => {
			const { data: redeemed, error: redeemError } = await ctx.supabase.rpc(
				"redeem_pairing_code",
				{ p_code: input.code },
			);
			if (redeemError || !redeemed?.[0]) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Code not valid.",
					cause: redeemError,
				});
			}
			const { restaurant_id: restaurantId, station_type: stationType } =
				redeemed[0];

			const adminClient = createAdminClient();
			const email = stationEmail(restaurantId, stationType);

			const { data: existingStaff, error: existingStaffError } =
				await adminClient
					.from("staff")
					.select("user_id")
					.eq("restaurant_id", restaurantId)
					.eq("email", email)
					.maybeSingle();
			if (existingStaffError) {
				throw dbError("Unable to provision the station device.", existingStaffError);
			}
			let userId = existingStaff?.user_id;

			if (!userId) {
				const { data: created, error: createError } =
					await adminClient.auth.admin.createUser({
						email,
						email_confirm: true,
					});
				if (createError || !created.user) {
					throw dbError("Unable to provision the station device.", createError);
				}
				userId = created.user.id;

				const { error: staffError } = await adminClient.from("staff").insert({
					restaurant_id: restaurantId,
					user_id: userId,
					email,
					role: stationType,
					status: "active",
				});
				if (staffError) {
					throw dbError("Unable to provision the station device.", staffError);
				}
			}

			const { data: link, error: linkError } =
				await adminClient.auth.admin.generateLink({
					type: "magiclink",
					email,
				});
			if (linkError || !link) {
				throw dbError("Unable to pair this device.", linkError);
			}

			const { data: device, error: deviceError } = await adminClient
				.from("station_devices")
				.insert({ restaurant_id: restaurantId, station_type: stationType })
				.select("id")
				.single();
			if (deviceError || !device) {
				throw dbError("Unable to pair this device.", deviceError);
			}

			return {
				email,
				tokenHash: link.properties.hashed_token,
				restaurantId,
				deviceId: device.id,
			};
		}),

	revokeDevice: authedProcedure
		.input(revokeDeviceInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth.rpc("revoke_station_device", {
				p_device_id: input.deviceId,
			});
			if (error || !data?.[0]) {
				throw dbError("Unable to revoke that device.", error);
			}
			return { id: data[0].id, revokedAt: data[0].revoked_at };
		}),

	listDevices: authedProcedure
		.input(listDevicesInput)
		.query(async ({ ctx, input }) => {
			await requireStaffRole(ctx, input.restaurantId, ["owner", "manager"]);

			const { data, error } = await ctx.auth.rpc("list_station_devices", {
				p_restaurant_id: input.restaurantId,
			});
			if (error) {
				throw dbError("Unable to load paired devices.", error);
			}
			return (data ?? []).map((row) => ({
				id: row.id,
				stationType: row.station_type,
				createdAt: row.created_at,
				revokedAt: row.revoked_at,
			}));
		}),

	// Tells the Floor page whether the signed-in identity is a shared
	// station device (in which case it needs a PIN pad), whether *this*
	// device was revoked (in which case it needs to bounce back to
	// /station/pair instead), and, if a PIN session cookie is already
	// present, who's acting.
	myStationStatus: authedProcedure
		.input(z.object({ restaurantId: z.string().uuid() }))
		.query(async ({ ctx }) => {
			const {
				data: { user },
			} = await ctx.auth.auth.getUser();

			const { data: staffRow } = await ctx.auth
				.from("staff")
				.select("email")
				.eq("user_id", user?.id ?? "")
				.eq("status", "active")
				.like("email", "%@stations.dineinly.internal")
				.maybeSingle();

			const isStation = staffRow != null;
			if (!isStation) {
				return { isStation, actingStaffName: null, deviceRevoked: false };
			}

			let deviceRevoked = false;
			if (ctx.stationDeviceId) {
				const { data: revoked } = await ctx.auth.rpc(
					"is_station_device_revoked",
					{ p_device_id: ctx.stationDeviceId },
				);
				deviceRevoked = revoked ?? false;
			}
			if (deviceRevoked || !ctx.stationSession) {
				return { isStation, actingStaffName: null, deviceRevoked };
			}

			const { data: named } = await ctx.auth.rpc("resolve_active_floor_staff", {
				p_restaurant_id: ctx.stationSession.restaurantId,
				p_staff_id: ctx.stationSession.staffId,
			});

			return { isStation, actingStaffName: named?.[0]?.name ?? null, deviceRevoked };
		}),
});
