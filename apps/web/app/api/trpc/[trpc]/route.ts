import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/trpc/context";

// tRPC is the only data layer (docs/tech-stack.md) — every mutation and
// query in the app goes through this one handler.
const handler = (request: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req: request,
		router: appRouter,
		createContext,
		onError({ error, path }) {
			console.error(`tRPC error on ${path ?? "<unknown>"}:`, error);
		},
	});

export { handler as GET, handler as POST };
