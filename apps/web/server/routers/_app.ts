import { publicProcedure, router } from "../trpc/init";

// health.ping proves the wiring end to end (route handler → context → env
// validation) and gives the client provider something real to call. It is
// not a feature — the first real router replaces it as the usage example.
export const appRouter = router({
	health: router({
		ping: publicProcedure.query(() => ({ ok: true as const, ts: Date.now() })),
	}),
});

export type AppRouter = typeof appRouter;
