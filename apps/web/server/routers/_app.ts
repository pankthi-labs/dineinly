import { publicProcedure, router } from "../trpc/init";
import { menuRouter } from "./menu";

// health.ping proves the wiring end to end (route handler → context → env
// validation) and gives the client provider something real to call.
export const appRouter = router({
	health: router({
		ping: publicProcedure.query(() => ({
			ok: true as const,
			serverTime: Date.now(),
		})),
	}),
	menu: menuRouter,
});

export type AppRouter = typeof appRouter;
