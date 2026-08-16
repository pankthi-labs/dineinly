import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
	// Anyone with a live Supabase session — admin or already-linked staff —
	// has no business seeing the email/OTP form again. Dineinly Admin lands
	// on /admin; staff lands on their restaurant's home page. The staff
	// lookup is scoped to the caller's own row via user_id, not RLS alone —
	// staff_roster_select (supabase/migrations/20260816164344_add_staff_roster_rpcs.sql)
	// gives Owner/Manager visibility into every active row at their
	// restaurant, not just their own.
	const viewer = await getViewer();
	if (viewer) {
		if (viewer.isAdmin) {
			redirect("/admin");
		}

		const supabase = await createClient();
		const { data: staffRow } = await supabase
			.from("staff")
			.select("restaurant_id")
			.eq("user_id", viewer.id)
			.eq("status", "active")
			.maybeSingle();

		if (staffRow) {
			redirect(`/restaurants/${staffRow.restaurant_id}`);
		}

		// A live session with no admin claim and no active Staff row anywhere
		// isn't "go to /admin" — that's requireAdmin() territory, and it would
		// immediately redirect back here. Access was removed (or never
		// granted); the session itself is stale, so drop it and fall through
		// to the sign-in form rather than bouncing between routes.
		await supabase.auth.signOut();
	}

	return <SignInForm />;
}
