import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Validated env access. Import `env` instead of `process.env` anywhere in
// the app — an invalid/missing var fails fast at startup, not mid-request.
// See docs/tech-stack.md § Security > Environment Validation.
export const env = createEnv({
	server: {
		// Private JWK (JSON, RS256) used to sign guest JWTs. See
		// lib/guest-token.ts and supabase/config.toml `signing_keys_path`.
		GUEST_JWT_SIGNING_KEY: z.string().min(1),
	},
	client: {
		NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
		NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
	},
	experimental__runtimeEnv: {
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
	},
});
