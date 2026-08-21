import { TRPCError } from "@trpc/server";

/** Wraps an unexpected Postgres/RPC failure as a generic 500 for the
 * client, keeping the original error attached via `cause` for server-side
 * logs without exposing it client-side. */
export function dbError(message: string, cause: unknown): TRPCError {
	return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause });
}
