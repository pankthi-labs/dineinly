import * as jose from "jose";
import { z } from "zod";
import { env } from "./env";

// Guest auth infrastructure only — mint/verify, no session resolution, no
// cookie handling, no QR lookup (that's the guest flow, built separately).
// See docs/architecture.md § Guest Sessions & Anonymous Realtime:
//
//   "Guest tokens are server-minted asymmetric-signed JWTs (Supabase-trusted
//   signing key) carrying only the session claims — no per-guest anonymous
//   auth user is created. Supabase validates the signature; RLS + Realtime
//   authorize from the claims. Never hand-roll or symmetric-sign tokens."
//
// GUEST_JWT_SIGNING_KEY must be the exact private key registered in
// supabase/signing_keys.json (config.toml `signing_keys_path`) — that's
// what makes Supabase (PostgREST/Realtime) trust a token this server mints.
//
// Two PostgREST/Supabase mechanics that are easy to get wrong here, both
// verified empirically against local PostgREST (a naive first version
// failed on both):
//
// 1. The header MUST carry `kid` matching the signing key's `kid` in
//    signing_keys.json. Without it PostgREST can't pick a key out of the
//    JWKS and rejects the token with "No suitable key" — a raw `alg`-only
//    header isn't enough even with a single key on file.
// 2. The top-level `role` claim is not an app concept — PostgREST reads it
//    to literally `SET LOCAL ROLE <value>` in Postgres, so it must name a
//    real, pre-granted role (`anon` / `authenticated`), never an arbitrary
//    string. Guests are still `role: "authenticated"` for that reason;
//    `app_role: "guest"` is our own claim RLS policies branch on to tell
//    a guest session apart from a staff one.

const GUEST_TOKEN_ALG = "RS256";
const GUEST_TOKEN_MIN_TTL_SECONDS = 12 * 60 * 60; // architecture.md: "≥12h, longer for events"

export const guestClaimsSchema = z.object({
	restaurant_id: z.uuid(),
	table_session_id: z.uuid(),
	app_role: z.literal("guest"),
});

export type GuestClaims = z.infer<typeof guestClaimsSchema>;

function signingJwk() {
	return JSON.parse(env.GUEST_JWT_SIGNING_KEY) as {
		kty: string;
		kid: string;
		n: string;
		e: string;
		alg: string;
	};
}

let cachedPrivateKey: Promise<jose.CryptoKey> | undefined;

function privateKey() {
	cachedPrivateKey ??= (async () => {
		// WebCrypto requires key_ops to be exactly ["sign"] for a private-key
		// import — `supabase gen signing-key` emits ["sign","verify"] on the
		// combined JWK, which importKey rejects for a private key.
		return jose.importJWK(
			{ ...signingJwk(), key_ops: ["sign"] },
			GUEST_TOKEN_ALG,
		) as Promise<jose.CryptoKey>;
	})();
	return cachedPrivateKey;
}

let cachedPublicKey: Promise<jose.CryptoKey> | undefined;

function publicKey() {
	cachedPublicKey ??= (async () => {
		// Only the public members (n, e) — signing-only fields (d, p, q, ...)
		// are never handed to the verifier, even though it's the same process.
		const { kty, n, e, alg, kid } = signingJwk();
		return jose.importJWK(
			{ kty, n, e, alg, kid, key_ops: ["verify"] },
			GUEST_TOKEN_ALG,
		) as Promise<jose.CryptoKey>;
	})();
	return cachedPublicKey;
}

/** Mints a scoped, signed guest JWT. Caller sets it as an httpOnly cookie. */
export async function mintGuestToken(claims: GuestClaims): Promise<string> {
	const key = await privateKey();
	const { kid } = signingJwk();
	return new jose.SignJWT({ ...claims, role: "authenticated" })
		.setProtectedHeader({ alg: GUEST_TOKEN_ALG, kid })
		.setIssuedAt()
		.setExpirationTime(`${GUEST_TOKEN_MIN_TTL_SECONDS}s`)
		.sign(key);
}

/** Verifies signature + expiry and returns the typed claims, or null. */
export async function verifyGuestToken(
	token: string,
): Promise<GuestClaims | null> {
	try {
		const key = await publicKey();
		const { payload } = await jose.jwtVerify(token, key, {
			algorithms: [GUEST_TOKEN_ALG],
		});
		return guestClaimsSchema.parse(payload);
	} catch {
		return null;
	}
}
