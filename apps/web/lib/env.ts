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
		// HMAC secret for the "acting staff" PIN-unlock cookie
		// (lib/station-session.ts). Deliberately not the guest-token RS256
		// signing key: this cookie never reaches Supabase as a bearer credential
		// (architecture.md: PIN grants "no DB access"), so a symmetric app-only
		// secret is the right-sized mechanism — no JWK, no Supabase-trusted key.
		STATION_PIN_SECRET: z.string().min(32),
		// Bypasses RLS entirely — used only by lib/supabase/admin.ts for the
		// Supabase Auth Admin API (managing Dineinly Admin identities, which
		// have no table of their own). Never imported client-side.
		SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
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
