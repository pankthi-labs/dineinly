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

		const supabase = await createClient();
		const { data: staffRow } = await supabase
			.from("staff")
			.select("restaurant_id")
			.eq("status", "active")
			.maybeSingle();

		redirect(staffRow ? `/restaurants/${staffRow.restaurant_id}` : "/admin");
	}

	return <SignInForm />;
}
