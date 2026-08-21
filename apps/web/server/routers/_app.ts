import { publicProcedure, router } from "../trpc/init";
import { adminStaffRouter } from "./admin-staff";
import { authRouter } from "./auth";
import { billsRouter } from "./bills";
import { floorRouter } from "./floor";
import { guestRouter } from "./guest";
import { kitchenRouter } from "./kitchen";
import { menuRouter } from "./menu";
import { restaurantsRouter } from "./restaurants";
import { staffRouter } from "./staff";
import { stationRouter } from "./station";
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
	floor: floorRouter,
	guest: guestRouter,
	kitchen: kitchenRouter,
	menu: menuRouter,
	restaurants: restaurantsRouter,
	staff: staffRouter,
	station: stationRouter,
	tables: tablesRouter,
});

export type AppRouter = typeof appRouter;
