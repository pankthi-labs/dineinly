import { generateKeyPairSync } from "node:crypto";

// Loads the repo-root .env for local test runs (Node 22+ native env-file
// support). CI sets real process env vars directly and has no .env file —
// that's expected, not an error.
try {
	process.loadEnvFile();
} catch {
	// no .env file present — fine in CI
}

// Tests only round-trip our own mint/verify — they never reach Supabase, so
// they must never read the real signing key. Overwrite it with a throwaway
// RS256 keypair per run: no valid key has to sit in .env for `pnpm test`,
// and none has to sit in .github/workflows/ci.yml.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.GUEST_JWT_SIGNING_KEY = JSON.stringify({
	...privateKey.export({ format: "jwk" }),
	kid: "test-only",
	alg: "RS256",
});
