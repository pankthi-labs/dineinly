import { createServerClient } from "@supabase/ssr";
import type { Database } from "@workspace/db";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
	GUEST_TOKEN_MENU_TTL_SECONDS,
	GUEST_TOKEN_MIN_TTL_SECONDS,
	mintGuestToken,
	verifyGuestToken,
} from "@/lib/guest-token";

// "Order More" (Counter, post-settle — docs/guest/bill/page.tsx): submit_order()
// rejects any further order on a session whose bill is already settled
// (core-data-model.md § Lifecycle invariants — "a settled session's bill
// never reopens"), so ordering again can't append to the same session. This
// re-runs the same universal-QR resolution app/qr/[qrToken]/route.ts does —
// same restaurant, brand-new tableless session (docs/core-data-model.md §
// Experience Gating) — without the guest re-scanning. Guests never have
// accounts, so the settled session simply stops being this browser tab's
// session; it stays exactly as it is in staff's Bills history.

const GUEST_TOKEN_COOKIE = "dineinly_guest_token";

export async function GET(request: NextRequest) {
	const origin = `${request.headers.get("x-forwarded-proto") ?? "http"}://${request.headers.get("host")}`;
	const menuUrl = new URL("/guest/menu", origin);

	const existingToken = request.cookies.get(GUEST_TOKEN_COOKIE)?.value;
	const claims = existingToken ? await verifyGuestToken(existingToken) : null;
	if (!claims) {
		return NextResponse.redirect(menuUrl);
	}

	// Guest-scoped client (same pattern as server/trpc/context.ts) — RLS
	// (guest_select_own_restaurant) already allows this guest to read their
	// own restaurant row, qr_token included.
	const supabase = createServerClient<Database>(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: { getAll: () => [], setAll: () => {} },
			global: { headers: { Authorization: `Bearer ${existingToken}` } },
		},
	);

	const restaurantResult = await supabase
		.from("restaurants")
		.select("qr_token")
		.eq("id", claims.restaurant_id)
		.maybeSingle();

	if (!restaurantResult.data?.qr_token) {
		return NextResponse.redirect(menuUrl);
	}

	const { data, error } = await supabase
		.rpc("resolve_qr_token", { p_qr_token: restaurantResult.data.qr_token })
		.single();

	if (error || !data) {
		return NextResponse.redirect(menuUrl);
	}

	const ttlSeconds =
		data.experience === "menu"
			? GUEST_TOKEN_MENU_TTL_SECONDS
			: GUEST_TOKEN_MIN_TTL_SECONDS;

	const token = await mintGuestToken(
		{
			restaurant_id: data.restaurant_id,
			table_session_id: data.table_session_id,
			table_label: data.table_label,
			app_role: "guest",
		},
		ttlSeconds,
	);

	const response = NextResponse.redirect(menuUrl);
	response.cookies.set(GUEST_TOKEN_COOKIE, token, {
		httpOnly: true,
		secure: origin.startsWith("https:"),
		sameSite: "lax",
		maxAge: ttlSeconds,
		path: "/",
	});
	return response;
}
