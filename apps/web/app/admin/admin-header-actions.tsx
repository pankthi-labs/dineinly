"use client";

import { LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const headerActionClass =
	"icon-tap-target flex items-center gap-2 text-caps text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary focus-visible:text-primary";

/**
 * `showProfile` is true only on the admin home dashboard — sub-pages (the
 * restaurants directory, menu desk, etc.) show just Log out, since Profile
 * is one "← Admin" tap away and repeating it on every header crowded the
 * mobile layout.
 */
export function AdminHeaderActions({
	showProfile = false,
}: {
	showProfile?: boolean;
}) {
	const router = useRouter();

	async function handleLogOut() {
		const supabase = createClient();
		await supabase.auth.signOut();
		router.replace("/sign-in");
	}

	return (
		<div className="flex items-center gap-6">
			{showProfile ? (
				<button type="button" className={headerActionClass}>
					<User className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
					Profile
				</button>
			) : null}
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
