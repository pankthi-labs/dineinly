import { generateKeyPairSync } from "node:crypto";

// Tests are hermetic: every var env.ts validates is set here, per-run, before
// any test module (and therefore env.ts) is imported. No .env file is read,
// and ambient values are overwritten rather than deferred to, so a local shell
// and CI see an identical environment.

// Tests only round-trip our own mint/verify — they never reach Supabase — so
// a throwaway RS256 keypair per run beats a real key sitting in .env or CI:
// nothing to leak, nothing to keep in sync with supabase/signing_keys.json.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.GUEST_JWT_SIGNING_KEY = JSON.stringify({
	...privateKey.export({ format: "jwk" }),
	kid: "test-only",
	alg: "RS256",
});

// Nothing in the suite talks to Supabase, so these never need to resolve to a
// real project — env.ts just needs them present and URL-shaped.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only-anon-key";
