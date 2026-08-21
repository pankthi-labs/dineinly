import * as jose from "jose";
import { z } from "zod";
import { env } from "./env";

// "Acting as {waiter}" cookie for a paired station device (docs/
// architecture.md § Station Account Provisioning). This is deliberately
// not lib/guest-token.ts's pattern: that RS256 key exists so Supabase
// itself trusts the token as a Postgres role claim. This cookie never
// reaches Supabase — PIN grants no DB access — so a plain HMAC over an
// app-only secret is the right-sized mechanism.
// The synthetic email suffix identifying a shared station account (docs/
// architecture.md § Station Account Provisioning) — the one thing that
// distinguishes a station's Staff row from a real named waiter's.
export const STATION_EMAIL_SUFFIX = "@stations.dineinly.internal";

const STATION_SESSION_ALG = "HS256";
export const STATION_SESSION_COOKIE = "dineinly_station_session";
/** Flat 12h expiry, no sliding refresh — matches the existing
 *  GUEST_TOKEN_MIN_TTL_SECONDS convention. Also the cookie's max-age. */
export const STATION_SESSION_TTL_SECONDS = 12 * 60 * 60;

// Signed device-identity cookie (docs/architecture.md § Station Account
// Provisioning: revoke "invalidates only that device's session"). Unlike
// the PIN session above, this one persists for a year — it identifies the
// physical device across shifts, not a per-shift "acting as" unlock. Signed
// with the same app-only HMAC secret as the PIN session: this still never
// reaches Supabase as a bearer credential, it only ever gates
// requireOwnStaffId's revocation check.
export const STATION_DEVICE_ID_COOKIE = "dineinly_station_device_id";
export const STATION_DEVICE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

const stationDeviceClaimsSchema = z.object({
	deviceId: z.string().uuid(),
	restaurantId: z.string().uuid(),
});

export type StationDeviceClaims = z.infer<typeof stationDeviceClaimsSchema>;

const stationClaimsSchema = z.object({
	staffId: z.string().uuid(),
	restaurantId: z.string().uuid(),
});

export type StationSessionClaims = z.infer<typeof stationClaimsSchema>;

let cachedKey: Promise<jose.CryptoKey> | undefined;

function secretKey(): Promise<jose.CryptoKey> {
	cachedKey ??= jose.importJWK(
		{
			kty: "oct",
			k: Buffer.from(env.STATION_PIN_SECRET).toString("base64url"),
		},
		STATION_SESSION_ALG,
	) as Promise<jose.CryptoKey>;
	return cachedKey;
}

/** Mints the signed "acting staff" token. Caller sets it as an httpOnly cookie. */
export async function mintStationSessionToken(
	claims: StationSessionClaims,
): Promise<string> {
	const key = await secretKey();
	return new jose.SignJWT({ ...claims })
		.setProtectedHeader({ alg: STATION_SESSION_ALG })
		.setIssuedAt()
		.setExpirationTime(`${STATION_SESSION_TTL_SECONDS}s`)
		.sign(key);
}

/** Verifies signature + expiry and returns the typed claims, or null. */
export async function verifyStationSessionToken(
	token: string,
): Promise<StationSessionClaims | null> {
	try {
		const key = await secretKey();
		const { payload } = await jose.jwtVerify(token, key, {
			algorithms: [STATION_SESSION_ALG],
		});
		return stationClaimsSchema.parse(payload);
	} catch {
		return null;
	}
}

/** Mints the signed device-identity token. Caller stores it as the
 *  STATION_DEVICE_ID_COOKIE cookie. */
export async function mintStationDeviceToken(
	claims: StationDeviceClaims,
): Promise<string> {
	const key = await secretKey();
	return new jose.SignJWT({ ...claims })
		.setProtectedHeader({ alg: STATION_SESSION_ALG })
		.setIssuedAt()
		.setExpirationTime(`${STATION_DEVICE_TOKEN_TTL_SECONDS}s`)
		.sign(key);
}

/** Verifies signature + expiry and returns the typed claims, or null. */
export async function verifyStationDeviceToken(
	token: string,
): Promise<StationDeviceClaims | null> {
	try {
		const key = await secretKey();
		const { payload } = await jose.jwtVerify(token, key, {
			algorithms: [STATION_SESSION_ALG],
		});
		return stationDeviceClaimsSchema.parse(payload);
	} catch {
		return null;
	}
}
