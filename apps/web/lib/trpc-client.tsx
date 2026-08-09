"use client";

import {
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
			links: [httpBatchLink({ url: `${getBaseUrl()}/api/trpc` })],
		}),
	);

	return (
		<trpc.Provider client={trpcClient} queryClient={queryClient}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</trpc.Provider>
	);
}
