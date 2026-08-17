import { publicProcedure, router } from "../trpc/init";
import { adminStaffRouter } from "./admin-staff";
import { authRouter } from "./auth";
import { billsRouter } from "./bills";
import { guestRouter } from "./guest";
import { kitchenRouter } from "./kitchen";
import { menuRouter } from "./menu";
import { restaurantsRouter } from "./restaurants";
import { staffRouter } from "./staff";
import { tablesRouter } from "./tables";

// health.ping proves the wiring end to end (route handler → context → env
// validation) and gives the client provider something real to call.
export const appRouter = router({
	health: router({
		ping: publicProcedure.query(() => ({
			ok: true as const,
			serverTime: Date.now(),
		})),
	}),
	adminStaff: adminStaffRouter,
	auth: authRouter,
	bills: billsRouter,
	guest: guestRouter,
	kitchen: kitchenRouter,
	menu: menuRouter,
	restaurants: restaurantsRouter,
	staff: staffRouter,
	tables: tablesRouter,
});

export type AppRouter = typeof appRouter;
