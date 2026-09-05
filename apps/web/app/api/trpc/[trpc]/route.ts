import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/trpc/context";

// tRPC is the only data layer (docs/tech-stack.md) — every mutation and
// query in the app goes through this one handler. Every response is guest-
// session- or staff-auth-scoped via the Cookie header, not the URL, so it
// must never be cacheable by a CDN or mobile-network proxy that only keys on
// URL+method — that would leak one tenant's response to the next caller of
// the same endpoint.
const handler = (request: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req: request,
		router: appRouter,
		createContext,
		// The client forces queries over POST too (methodOverride: "POST" in
		// lib/trpc-client.tsx) so no request ever exposes a same-URL-for-every-
		// caller GET for a caching intermediary to key on. Without this flag the
		// server still enforces the underlying query/mutation split by HTTP
		// method and rejects a query arriving as POST.
		allowMethodOverride: true,
		responseMeta: () => ({
			headers: { "cache-control": "no-store" },
		}),
		onError({ error, path }) {
			console.error(`tRPC error on ${path ?? "<unknown>"}:`, error);
		},
	});

// GET intentionally not exported: the client forces every call (queries
// included) over POST (lib/trpc-client.tsx) specifically so this endpoint is
// never a GET, since a GET's URL alone (no per-guest/session differentiator)
// is what a caching intermediary would key on. Not serving GET at all closes
// that off even against a proxy that fails to honor cache-control.
export { handler as POST };
