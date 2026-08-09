import { publicProcedure, router } from "../trpc/init";
import { authRouter } from "./auth";
import { guestRouter } from "./guest";
import { kitchenRouter } from "./kitchen";
import { menuRouter } from "./menu";
import { restaurantsRouter } from "./restaurants";

// health.ping proves the wiring end to end (route handler → context → env
// validation) and gives the client provider something real to call.
export const appRouter = router({
	health: router({
		ping: publicProcedure.query(() => ({
			ok: true as const,
			serverTime: Date.now(),
		})),
	}),
	auth: authRouter,
	guest: guestRouter,
	kitchen: kitchenRouter,
	menu: menuRouter,
	restaurants: restaurantsRouter,
});

export type AppRouter = typeof appRouter;
