import * as jose from "jose";
import { z } from "zod";
import { env } from "./env";

// "Acting as {waiter}" cookie for a paired station device (docs/
// architecture.md § Station Account Provisioning). This is deliberately
// not lib/guest-token.ts's pattern: that RS256 key exists so Supabase
// itself trusts the token as a Postgres role claim. This cookie never
// reaches Supabase — PIN grants no DB access — so a plain HMAC over an
// app-only secret is the right-sized mechanism.
const STATION_SESSION_ALG = "HS256";
export const STATION_SESSION_COOKIE = "dineinly_station_session";
/** Flat 12h expiry, no sliding refresh — matches the existing
 *  GUEST_TOKEN_MIN_TTL_SECONDS convention. Also the cookie's max-age. */
export const STATION_SESSION_TTL_SECONDS = 12 * 60 * 60;

// Plain (unsigned, client-writable) — just an identifier, not a
// credential. Set once by /station/pair after a successful pairing, read
// back by the Floor page to ask is_station_device_revoked() about this
// specific device. Revocation here is a courtesy redirect, not a security
// boundary, so it doesn't need signing — the real boundary is the
// Supabase station session plus the PIN check, neither of which a forged
// device id can bypass.
export const STATION_DEVICE_ID_COOKIE = "dineinly_station_device_id";

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
