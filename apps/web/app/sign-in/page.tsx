import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage() {
	// Anyone with a live Supabase session — admin or already-linked staff —
	// has no business seeing the email/OTP form again. Everyone lands on
	// /admin today; see Tbd.md #3 for splitting that by role once a
	// restaurant home page exists.
	const viewer = await getViewer();
	if (viewer) {
		redirect("/admin");
	}

	return <SignInForm />;
}
