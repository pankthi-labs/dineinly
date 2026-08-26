import { createClient } from "@supabase/supabase-js";
import type { Database } from "@workspace/db";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
	GUEST_TOKEN_MENU_TTL_SECONDS,
	GUEST_TOKEN_MIN_TTL_SECONDS,
	mintGuestToken,
} from "@/lib/guest-token";

// Resolve-only route (docs/architecture.md § Route Structure) — not a page
// tree. Validates qr_token, mints the guest JWT, sets the cookie, redirects
// into app/guest/menu. Stays flat (not nested under a restaurantId segment):
// qr_token alone resolves to one table and its restaurant.

const GUEST_TOKEN_COOKIE = "dineinly_guest_token";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ qrToken: string }> },
) {
	const { qrToken } = await params;

	// request.url resolves against the dev server's bind address (0.0.0.0
	// when started with `next dev -H 0.0.0.0` for LAN/phone testing) rather
	// than the Host header the client actually sent, producing redirects to
	// an unreachable address. Build the origin from the Host header instead.
	const origin = `${request.headers.get("x-forwarded-proto") ?? "http"}://${request.headers.get("host")}`;

	// No guest session exists yet at this point, so this is a plain anon-key
	// client — resolve_qr_token is the one function granted to `anon`
	// (supabase/migrations/20260730150634_..._policies.sql § 8).
	const supabase = createClient<Database>(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
	);

	const { data, error } = await supabase
		.rpc("resolve_qr_token", { p_qr_token: qrToken })
		.single();

	// Invalid or rotated QR: land on the menu with no cookie set. Per
	// architecture.md, a missing guest cookie on app/guest/... is never an
	// error/redirect condition — it's just "no data" — so this reuses that
	// same neutral empty state instead of a dedicated invalid-QR page.
	if (error || !data) {
		return NextResponse.redirect(new URL("/guest/menu", origin));
	}

	const ttlSeconds =
		data.experience === "menu"
			? GUEST_TOKEN_MENU_TTL_SECONDS
			: GUEST_TOKEN_MIN_TTL_SECONDS;

	const token = await mintGuestToken(
		{
			restaurant_id: data.restaurant_id,
			session_id: data.session_id,
			table_label: data.table_label,
			app_role: "guest",
		},
		ttlSeconds,
	);

	const response = NextResponse.redirect(new URL("/guest/menu", origin));
	response.cookies.set(GUEST_TOKEN_COOKIE, token, {
		httpOnly: true,
		secure: origin.startsWith("https:"),
		sameSite: "lax",
		maxAge: ttlSeconds,
		path: "/",
	});
	return response;
}
