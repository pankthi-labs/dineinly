import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
	// Anyone with a live Supabase session — admin or already-linked staff —
	// has no business seeing the email/OTP form again. Dineinly Admin lands
	// on /admin; staff lands on their restaurant's home page (RLS-scoped
	// lookup, same as requireRestaurantAccess — see lib/auth.ts).
	const viewer = await getViewer();
	if (viewer) {
		if (viewer.isAdmin) {
			redirect("/admin");
		}

		// Explicit user_id filter, not just RLS: an Owner/Manager's RLS reach
		// on staff isn't scoped to their own row alone (staff_roster_select,
		// supabase/migrations/20260816164344_add_staff_roster_rpcs.sql, exposes
		// every active row at their restaurant). Without this filter
		// .maybeSingle() sees every teammate's row too and errors as soon as
		// there's more than one, which this fallback silently treats as "not
		// staff" and sends to /admin instead.
		const supabase = await createClient();
		const { data: staffRow } = await supabase
			.from("staff")
			.select("restaurant_id")
			.eq("user_id", viewer.id)
			.eq("status", "active")
			.maybeSingle();

		redirect(staffRow ? `/restaurants/${staffRow.restaurant_id}` : "/admin");
	}

	return <SignInForm />;
}
