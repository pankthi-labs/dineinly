import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@workspace/db";
import { env } from "@/lib/env";

// Service-role client — bypasses RLS entirely via the service_role key, not
// a user session. Used only by server/routers/admin-staff.ts for the
// Supabase Auth Admin API (auth.admin.*), managing Dineinly Admin identities
// (see docs/core-data-model.md — Admin has no table of its own, this API is
// its persistence). Never import this from client code or from a procedure
// that isn't already gated by adminProcedure.
export function createAdminClient() {
	return createSupabaseClient<Database>(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.SUPABASE_SERVICE_ROLE_KEY,
		{ auth: { autoRefreshToken: false, persistSession: false } },
	);
}
