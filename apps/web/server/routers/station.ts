import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	mintStationDeviceToken,
	STATION_EMAIL_SUFFIX,
} from "@/lib/station-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError } from "../trpc/errors";
import { authedProcedure, publicProcedure, router } from "../trpc/init";
import { requireStaffRole } from "../trpc/rbac";
import {
	generatePairingCodeInput,
	listDevicesInput,
	redeemPairingCodeInput,
	revokeDeviceInput,
} from "./station.schema";

// Synthetic identity per restaurant per station type (docs/architecture.md
// § Station Account Provisioning) — unroutable, exists only to satisfy
// Supabase Auth's unique-email requirement. Nothing is ever sent to it.
function stationEmail(restaurantId: string, stationType: "waiter"): string {
	return `${stationType}-${restaurantId}${STATION_EMAIL_SUFFIX}`;
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

			// Atomic claim-or-revive of this restaurant+station-type's synthetic
			// Staff row (claim_station_staff, supabase/migrations) — replaces a
			// raw select-then-update-or-insert from this admin client, closing the
			// race where two concurrent first-ever pairings could both see no
			// existing row.
			const { data: claimed, error: claimError } = await adminClient.rpc(
				"claim_station_staff",
				{
					p_restaurant_id: restaurantId,
					p_station_type: stationType,
					p_email: email,
				},
			);
			if (claimError || !claimed?.[0]) {
				throw dbError("Unable to provision the station device.", claimError);
			}
			const { staff_id: staffId, needs_user: needsUser } = claimed[0];

			if (needsUser) {
				const { data: created, error: createError } =
					await adminClient.auth.admin.createUser({
						email,
						email_confirm: true,
					});
				if (createError || !created.user) {
					throw dbError("Unable to provision the station device.", createError);
				}

				const { error: linkUserError } = await adminClient.rpc(
					"link_station_user",
					{ p_staff_id: staffId, p_user_id: created.user.id },
				);
				if (linkUserError) {
					throw dbError(
						"Unable to provision the station device.",
						linkUserError,
					);
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

			const { data: deviceId, error: finishError } = await adminClient.rpc(
				"finish_station_provisioning",
				{ p_restaurant_id: restaurantId, p_station_type: stationType },
			);
			if (finishError || !deviceId) {
				throw dbError("Unable to pair this device.", finishError);
			}

			// Signed here, not on the device: the device stores this token as its
			// identity cookie, and requireOwnStaffId only trusts a device id it
			// can verify came from a real redemption.
			const deviceToken = await mintStationDeviceToken({
				deviceId,
				restaurantId,
			});

			return {
				email,
				tokenHash: link.properties.hashed_token,
				restaurantId,
				deviceId,
				deviceToken,
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

			const { data: staffRow, error: staffRowError } = await ctx.auth
				.from("staff")
				.select("email")
				.eq("user_id", user?.id ?? "")
				.eq("status", "active")
				.like("email", `%${STATION_EMAIL_SUFFIX}`)
				.maybeSingle();
			if (staffRowError) {
				throw dbError("Unable to check this device's status.", staffRowError);
			}

			const isStation = staffRow != null;
			if (!isStation) {
				return { isStation, actingStaffName: null, deviceRevoked: false };
			}

			let deviceRevoked = false;
			if (ctx.stationDeviceId) {
				const { data: revoked, error: revokedError } = await ctx.auth.rpc(
					"is_station_device_revoked",
					{ p_device_id: ctx.stationDeviceId },
				);
				if (revokedError) {
					throw dbError("Unable to check this device's status.", revokedError);
				}
				deviceRevoked = revoked ?? false;
			}
			if (deviceRevoked || !ctx.stationSession) {
				return { isStation, actingStaffName: null, deviceRevoked };
			}

			const { data: named, error: namedError } = await ctx.auth.rpc(
				"resolve_active_floor_staff",
				{
					p_restaurant_id: ctx.stationSession.restaurantId,
					p_staff_id: ctx.stationSession.staffId,
				},
			);
			if (namedError) {
				throw dbError("Unable to check this device's status.", namedError);
			}

			return {
				isStation,
				actingStaffName: named?.[0]?.name ?? null,
				deviceRevoked,
			};
		}),
});
