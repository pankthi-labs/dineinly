import type { PostgrestError } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import type { Database } from "@workspace/db";
import { buildTableQrPdf } from "@/lib/qr-pdf";
import type { Context } from "../trpc/context";
import { authedProcedure, router } from "../trpc/init";
import {
	createTableInput,
	downloadAllTableQrPdfInput,
	downloadTableQrPdfInput,
	listTablesInput,
	mergeTableInput,
	regenerateTableQrInput,
	setTableStatusInput,
	updateTableInput,
} from "./tables.schema";

function toTRPCError(error: PostgrestError, fallback: string): TRPCError {
	return new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: fallback,
		cause: error,
	});
}

function toBase64Pdf(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}

function toFileNameSegment(label: string): string {
	return label.replace(/[^a-zA-Z0-9-]+/g, "-");
}

const OCCUPIED_TABLE_MESSAGE =
	"This table is occupied — table config can't change until the session closes.";

// Edit/Regenerate/Hide all share one rule: none apply to an occupied table
// (docs/product.md § Table Matrix). `.is("session_id", null)` makes the
// check atomic with the write — no separate read-then-write race — and it's
// server-enforced here, not just a hidden button, since the client-side
// hiding in table-card.tsx is UX only.
async function updateFreeTable(
	auth: Context["auth"],
	id: string,
	patch: Database["public"]["Tables"]["restaurant_tables"]["Update"],
	errorMessage: string,
) {
	const { data, error } = await auth
		.from("restaurant_tables")
		.update(patch)
		.eq("id", id)
		.is("session_id", null)
		.select("id, label, qr_token, session_id, status")
		.maybeSingle();

	if (error) {
		throw toTRPCError(error, errorMessage);
	}
	if (!data) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: OCCUPIED_TABLE_MESSAGE,
		});
	}

	return data;
}

// authedProcedure (any signed-in Dineinly Admin or active staff member of
// the restaurant), not a stricter Owner/Manager-only check — see
// docs/architecture.md § Table QR Generation. staff_select_restaurant_tables
// (reads) and staff_write_restaurant_tables (Owner/Manager-only writes) RLS
// (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 5)
// scope every query/mutation here to the caller's own restaurant_id.
export const tablesRouter = router({
	list: authedProcedure.input(listTablesInput).query(async ({ ctx, input }) => {
		const { data, error } = await ctx.auth
			.from("restaurant_tables")
			.select("id, label, qr_token, session_id, status")
			.eq("restaurant_id", input.restaurantId)
			.order("status", { ascending: true })
			.order("label", { ascending: true });

		if (error) {
			throw toTRPCError(error, "Unable to load restaurant tables.");
		}

		return data;
	}),

	create: authedProcedure
		.input(createTableInput)
		.mutation(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth
				.from("restaurant_tables")
				.insert({
					restaurant_id: input.restaurantId,
					label: input.label,
					qr_token: crypto.randomUUID(),
				})
				.select("id, label, qr_token, session_id, status")
				.single();

			if (error) {
				throw toTRPCError(error, "Unable to create the table.");
			}

			return data;
		}),

	update: authedProcedure
		.input(updateTableInput)
		.mutation(async ({ ctx, input }) =>
			updateFreeTable(
				ctx.auth,
				input.id,
				{ label: input.label },
				"Unable to save the table.",
			),
		),

	setStatus: authedProcedure
		.input(setTableStatusInput)
		.mutation(async ({ ctx, input }) => {
			// Un-hiding (status: "active") never touches an occupied table by
			// construction — hiding is blocked below, so an occupied table can
			// never be archived in the first place.
			if (input.status === "active") {
				const { data, error } = await ctx.auth
					.from("restaurant_tables")
					.update({ status: input.status })
					.eq("id", input.id)
					.select("id, label, qr_token, session_id, status")
					.single();

				if (error) {
					throw toTRPCError(error, "Unable to update the table status.");
				}

				return data;
			}

			return updateFreeTable(
				ctx.auth,
				input.id,
				{ status: input.status },
				"Unable to update the table status.",
			);
		}),

	// Rotates qr_token in place — the old printed QR stops working
	// immediately (docs/product.md § Onboarding & Setup). No optimistic
	// update on the client: a failed regenerate must leave the previous
	// token/thumbnail exactly as it was.
	regenerateQr: authedProcedure
		.input(regenerateTableQrInput)
		.mutation(async ({ ctx, input }) =>
			updateFreeTable(
				ctx.auth,
				input.id,
				{ qr_token: crypto.randomUUID() },
				"Unable to regenerate the QR code.",
			),
		),

	downloadQrPdf: authedProcedure
		.input(downloadTableQrPdfInput)
		.query(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth
				.from("restaurant_tables")
				.select("label, qr_token")
				.eq("id", input.id)
				.maybeSingle();

			if (error) {
				throw toTRPCError(error, "Unable to load the table.");
			}
			if (!data) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Table not found." });
			}

			const pdf = await buildTableQrPdf(
				[{ label: data.label, qrToken: data.qr_token }],
				input.origin,
			);

			return {
				fileName: `${toFileNameSegment(data.label)}-qr.pdf`,
				base64: toBase64Pdf(pdf),
			};
		}),

	// Merge Tables (docs/product.md § Shared Table Session): folds a free
	// table into an already-active session. Delegates to
	// merge_table_into_session() (§ 14 of the RLS migration) — Waiter/
	// Manager/Owner reach, wider than every other write in this router
	// (Owner/Manager only), so it needs its own role check inside the RPC
	// rather than this router's usual plain RLS-backed write.
	merge: authedProcedure
		.input(mergeTableInput)
		.mutation(async ({ ctx, input }) => {
			const { error } = await ctx.auth.rpc("merge_table_into_session", {
				p_table_id: input.tableId,
				p_session_id: input.sessionId,
			});
			if (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error.message,
					cause: error,
				});
			}
			return { merged: true };
		}),

	downloadAllQrPdf: authedProcedure
		.input(downloadAllTableQrPdfInput)
		.query(async ({ ctx, input }) => {
			const { data, error } = await ctx.auth
				.from("restaurant_tables")
				.select("label, qr_token")
				.eq("restaurant_id", input.restaurantId)
				.eq("status", "active")
				.order("label", { ascending: true });

			if (error) {
				throw toTRPCError(error, "Unable to load restaurant tables.");
			}
			if (!data || data.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No tables to download.",
				});
			}

			const pdf = await buildTableQrPdf(
				data.map((table) => ({ label: table.label, qrToken: table.qr_token })),
				input.origin,
			);

			return { fileName: "all-tables-qr.pdf", base64: toBase64Pdf(pdf) };
		}),
});
