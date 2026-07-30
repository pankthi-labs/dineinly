import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

// Base tRPC setup every router imports from. See docs/architecture.md §
// Authorization & Idempotency: RBAC is enforced server-side, here — never
// trust a client-side check.
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

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
