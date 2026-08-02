import { initTRPC, TRPCError } from "@trpc/server";
import { getViewer } from "@/lib/auth";
import type { Context } from "./context";

// Base tRPC setup every router imports from. See docs/architecture.md §
// Authorization & Idempotency: RBAC is enforced server-side, here — never
// trust a client-side check.
//
// Every timestamp column is `mode: "string"` (packages/db/src/schema/
// helpers.ts), so responses carry plain ISO strings with no transformer
// needed — the same representation Supabase Realtime broadcast payloads
// carry (docs/realtime.md).
const trpc = initTRPC.context<Context>().create();

export const router = trpc.router;
export const publicProcedure = trpc.procedure;

/** Requires the platform-level Dineinly Admin identity. */
export const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
	const viewer = await getViewer();
	if (!viewer?.isAdmin) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Dineinly Admin access required.",
		});
	}
	return next({ ctx: { ...ctx, viewer } });
});

/** Requires a valid, unexpired guest JWT. Staff procedures arrive with staff auth. */
export const guestProcedure = publicProcedure.use(({ ctx, next }) => {
	if (!ctx.guest) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Valid guest session required.",
		});
	}
	return next({ ctx: { ...ctx, guest: ctx.guest } });
});
