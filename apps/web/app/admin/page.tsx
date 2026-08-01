import type { LucideIcon } from "lucide-react";
import { Settings, UserCog, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import { getViewer } from "@/lib/auth";
import { AdminHeaderActions } from "./admin-header-actions";

const navCards: Array<{
	title: string;
	description: string;
	icon: LucideIcon;
}> = [
	{
		title: "Restaurants Directory",
		description: "Manage restaurants",
		icon: UtensilsCrossed,
	},
	{
		title: "Dineinly Staff",
		description: "Manage admin and staff access",
		icon: UserCog,
	},
	{
		title: "Dineinly Settings",
		description: "Platform-wide configuration",
		icon: Settings,
	},
];

export default async function AdminDashboardPage() {
	// Already gated by app/admin/layout.tsx's requireAdmin() — this call
	// is just to read the display name, not to re-authorize.
	const viewer = await getViewer();

	return (
		<div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-12 py-16">
			<header className="mb-16 flex flex-col gap-12">
				<div className="flex items-center justify-between">
					<Image
						src="/brand/dineinly-logo-dark.svg"
						alt="Dineinly"
						width={140}
						height={45}
						priority
					/>

					<AdminHeaderActions />
				</div>

				<h1 className="font-medium text-5xl text-primary">
					Good Evening, {viewer?.displayName ?? "Admin"}.
				</h1>
			</header>

			<main className="grid flex-1 content-start gap-8 md:grid-cols-2 lg:grid-cols-3">
				{navCards.map(({ title, description, icon: Icon }) => (
					<button
						key={title}
						type="button"
						className="group flex flex-col gap-6 rounded-xl border border-divider bg-surface p-8 text-left transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated focus-visible:bg-surface-elevated"
					>
						<Icon
							className="icon-xl text-secondary transition-colors duration-(--duration-base) ease-out group-hover:text-accent-hover group-focus-visible:text-accent-hover"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
						<div>
							<h2 className="text-lg text-primary">{title}</h2>
							<p className="mt-2 text-muted text-sm">{description}</p>
						</div>
					</button>
				))}
			</main>

			<footer className="mt-24 border-divider border-t pt-8">
				<p className="text-caps text-muted">
					© {new Date().getFullYear()} Dineinly. All rights reserved.
				</p>
			</footer>
		</div>
	);
}
