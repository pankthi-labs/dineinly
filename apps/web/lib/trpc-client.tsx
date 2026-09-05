"use client";

import {
	focusManager,
	MutationCache,
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState } from "react";
import type { AppRouter } from "@/server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();

// Mobile browsers restore a backgrounded tab from bfcache (e.g. switching
// back to an already-open guest tab instead of a fresh QR scan) via a
// `pageshow` event with `persisted: true` — not the `visibilitychange`/
// `focus` events react-query's default focus manager listens for. Without
// this, a restored tab keeps rendering whatever menu data it fetched before
// being backgrounded, while any freshly-opened tab/browser always refetches
// on mount and looks correct — the exact mobile-vs-new-tab split reported.
if (typeof window !== "undefined") {
	focusManager.setEventListener((handleFocus) => {
		const onVisibility = () =>
			handleFocus(document.visibilityState === "visible");
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) handleFocus(true);
		};
		window.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("focus", onVisibility);
		window.addEventListener("pageshow", onPageShow);
		return () => {
			window.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("focus", onVisibility);
			window.removeEventListener("pageshow", onPageShow);
		};
	});
}

function getBaseUrl() {
	if (typeof window !== "undefined") return "";
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return "http://127.0.0.1:3000";
}

// A staff session that's expired or been signed out elsewhere surfaces as
// UNAUTHORIZED on the next call, from any query or mutation, on any staff
// page — one global handler here beats a "sign in again" link on every
// page's own error state. Guest procedures throw the same UNAUTHORIZED for
// "no/expired guest cookie", which is never an error for a guest page
// (docs/architecture.md) — those are excluded so the page's own empty
// state renders instead of bouncing a guest to the staff sign-in.
function redirectToSignInOnAuthError(error: unknown) {
	if (
		error instanceof TRPCClientError &&
		error.data?.code === "UNAUTHORIZED" &&
		!error.data?.path?.startsWith("guest.")
	) {
		window.location.href = "/sign-in";
	}
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				queryCache: new QueryCache({ onError: redirectToSignInOnAuthError }),
				mutationCache: new MutationCache({
					onError: redirectToSignInOnAuthError,
				}),
			}),
	);
	const [trpcClient] = useState(() =>
		trpc.createClient({
			// httpBatchLink defaults queries to GET, encoding the (often-empty,
			// e.g. guest.menu/guest.bill.get) input straight into the URL — the
			// same URL for every caller, since what actually varies per guest/
			// restaurant is the Cookie header. Every response here is tenant- and
			// session-scoped (docs/architecture.md), so it must never sit in a
			// cache keyed on URL alone: a mobile carrier's transparent proxy or
			// any other GET-caching intermediary would serve one guest's/table's
			// response to the next request for that same URL. Forcing POST is
			// what makes tRPC's own docs recommend this for exactly this case.
			links: [
				httpBatchLink({
					url: `${getBaseUrl()}/api/trpc`,
					methodOverride: "POST",
				}),
			],
		}),
	);

	return (
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
