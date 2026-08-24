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
// Two PostgREST mechanics that are easy to get wrong:
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
/** architecture.md: "≥12h, longer for events". Also the max-age of the
 *  cookie the token is set in, so the two expire together. */
export const GUEST_TOKEN_MIN_TTL_SECONDS = 12 * 60 * 60;
/** Dineinly Menu (docs/product.md § Dineinly Experiences) has no table to
 *  seat and no session a staff member ever closes, so its guest token is
 *  capped well short of full-service's — a guest who's been sitting on a
 *  stale tab re-scans instead of browsing an unbounded session. */
export const GUEST_TOKEN_MENU_TTL_SECONDS = 4 * 60 * 60;

export const guestClaimsSchema = z.object({
	restaurant_id: z.uuid(),
	table_session_id: z.uuid(),
	// null for counter-experience sessions (docs/core-data-model.md §
	// Experience Gating) — those are tableless, so there's nothing to label.
	// Display-only — the scanned table's label at mint time. Not re-checked
	// by RLS (restaurant_id/table_session_id are the only claims policies
	// scope on), so a merge after minting can leave this stale until the
	// guest's next scan; acceptable since it's UI copy, not an access grant.
	table_label: z.string().nullable(),
	app_role: z.literal("guest"),
});

export type GuestClaims = z.infer<typeof guestClaimsSchema>;

// RFC 7517 JWK member names — fixed by the format `supabase gen signing-key`
// emits and by what jose.importJWK reads, so they can't be renamed here.
// .passthrough(): privateKey() below spreads the full parsed object into
// jose.importJWK, so the RSA private components (d, p, q, ...) this schema
// doesn't name must survive .parse() rather than being stripped.
const signingJwkSchema = z
	.object({
		/** Key type. "RSA" for our RS256 signing key. */
		kty: z.string(),
		/** Key ID. Must match the entry in supabase/signing_keys.json, or
		 *  PostgREST can't pick a key out of the JWKS ("No suitable key"). */
		kid: z.string(),
		/** RSA modulus (base64url). Public half. */
		n: z.string(),
		/** RSA public exponent (base64url). Public half. */
		e: z.string(),
		/** Signing algorithm. "RS256". */
		alg: z.string(),
	})
	.passthrough();

// Parsed once, at module load, not per mint/verify call. `.parse` (not
// `.safeParse`) is deliberate: a malformed GUEST_JWT_SIGNING_KEY is a
// deploy configuration fault, so it must fail loudly at startup
// (architecture.md: "never fail silently") rather than surface as a
// mysteriously-invalid token on the first request. This is distinct from
// an invalid *token*, which is an expected runtime condition — see
// verifyGuestToken below, which handles that by returning null.
const signingJwk = signingJwkSchema.parse(
	JSON.parse(env.GUEST_JWT_SIGNING_KEY),
);

// Imported once per process, on first use. WebCrypto requires key_ops to be
// exactly ["sign"] for a private-key import — `supabase gen signing-key` emits
// ["sign","verify"] on the combined JWK, which importKey rejects here.
let cachedPrivateKey: Promise<jose.CryptoKey> | undefined;

function privateKey(): Promise<jose.CryptoKey> {
	cachedPrivateKey ??= jose.importJWK(
		{ ...signingJwk, key_ops: ["sign"] },
		GUEST_TOKEN_ALG,
	) as Promise<jose.CryptoKey>;
	return cachedPrivateKey;
}

// Memoized likewise, and built from only the public modulus and exponent
// (n, e) — signing-only fields (d, p, q, ...) are never handed to the
// verifier, even though it's the same process.
let cachedPublicKey: Promise<jose.CryptoKey> | undefined;

function publicKey(): Promise<jose.CryptoKey> {
	const { kty, n, e, alg, kid } = signingJwk;
	cachedPublicKey ??= jose.importJWK(
		{ kty, n, e, alg, kid, key_ops: ["verify"] },
		GUEST_TOKEN_ALG,
	) as Promise<jose.CryptoKey>;
	return cachedPublicKey;
}

/** Mints a scoped, signed guest JWT. Caller sets it as an httpOnly cookie
 *  with a matching max-age — `ttlSeconds` defaults to the full-service
 *  window; pass GUEST_TOKEN_MENU_TTL_SECONDS for a Dineinly Menu scan. */
export async function mintGuestToken(
	claims: GuestClaims,
	ttlSeconds: number = GUEST_TOKEN_MIN_TTL_SECONDS,
): Promise<string> {
	const key = await privateKey();
	return new jose.SignJWT({ ...claims, role: "authenticated" })
		.setProtectedHeader({ alg: GUEST_TOKEN_ALG, kid: signingJwk.kid })
		.setIssuedAt()
		.setExpirationTime(`${ttlSeconds}s`)
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
