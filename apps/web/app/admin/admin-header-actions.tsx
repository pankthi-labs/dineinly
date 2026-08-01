"use client";

import { LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const headerActionClass =
	"icon-tap-target flex items-center gap-2 text-caps text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary focus-visible:text-primary";

export function AdminHeaderActions() {
	const router = useRouter();

	async function handleLogOut() {
		const supabase = createClient();
		await supabase.auth.signOut();
		router.replace("/sign-in");
	}

	return (
		<div className="flex items-center gap-6">
			<button type="button" className={headerActionClass}>
				<User className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
				Profile
			</button>
			<button
				type="button"
				className={headerActionClass}
				onClick={handleLogOut}
			>
				<LogOut className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
				Log out
			</button>
		</div>
	);
}
