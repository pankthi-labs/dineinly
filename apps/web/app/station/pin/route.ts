import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
	mintStationSessionToken,
	STATION_EMAIL_SUFFIX,
	STATION_SESSION_COOKIE,
	STATION_SESSION_TTL_SECONDS,
} from "@/lib/station-session";
import { createClient } from "@/lib/supabase/server";
import { verifyPinInput } from "@/server/routers/station.schema";

// Auth-cookie issuance, not CRUD — same sanctioned exception to "tRPC
// only" that app/qr/[qrToken]/route.ts already uses for the guest token.
// A Route Handler is required here (not a tRPC mutation) because only a
// Route Handler/Server Component can write a response cookie — see
// apps/web/server/trpc/context.ts's comment on why tRPC context can't.
export async function POST(request: Request) {
	const body = verifyPinInput.safeParse(await request.json());
	if (!body.success) {
		return NextResponse.json({ error: "Invalid request." }, { status: 400 });
	}

	const supabase = await createClient();

	// Only a paired station device may resolve a PIN. Without this, any
	// signed-in staff member could brute-force a colleague's 4-digit PIN
	// remotely — the "no lockout" tradeoff this endpoint accepts only holds
	// while the physical tablet is the only way to reach it. The failure is
	// indistinguishable from a wrong PIN, same anti-enumeration posture as
	// resolve_staff_signin.
	const {
		data: { user },
	} = await supabase.auth.getUser();
	const { data: callerStaff } = await supabase
		.from("staff")
		.select("email")
		.eq("user_id", user?.id ?? "")
		.eq("status", "active")
		.maybeSingle();
	if (!callerStaff?.email.endsWith(STATION_EMAIL_SUFFIX)) {
		return NextResponse.json({ error: "PIN not recognized." }, { status: 401 });
	}

	const { data, error } = await supabase.rpc("resolve_staff_by_pin", {
		p_restaurant_id: body.data.restaurantId,
		p_pin: body.data.pin,
	});

	if (error || !data?.[0]) {
		return NextResponse.json({ error: "PIN not recognized." }, { status: 401 });
	}

	const token = await mintStationSessionToken({
		staffId: data[0].staff_id,
		restaurantId: body.data.restaurantId,
	});

	const response = NextResponse.json({ name: data[0].name });
	response.cookies.set(STATION_SESSION_COOKIE, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		maxAge: STATION_SESSION_TTL_SECONDS,
		path: "/",
	});
	return response;
}

// "Switch User" — clears the acting-staff cookie without touching the
// underlying Supabase station session, so the device stays paired.
export async function DELETE() {
	const cookieStore = await cookies();
	cookieStore.delete(STATION_SESSION_COOKIE);
	return NextResponse.json({ success: true });
}
