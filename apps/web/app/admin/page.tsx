import type { LucideIcon } from "lucide-react";
import { Settings, UserCog, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { AnimatedBrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";
import { getViewer } from "@/lib/auth";
import { getGreeting } from "@/lib/greeting";
import { AdminHeaderActions } from "./admin-header-actions";

const navCards: Array<{
	title: string;
	description: string;
	icon: LucideIcon;
	// Cards without an href aren't built yet (Dineinly Settings) — rendered
	// inert rather than linking nowhere.
	href?: string;
}> = [
	{
		title: "Restaurants Directory",
		description: "Manage restaurants",
		icon: UtensilsCrossed,
		href: "/admin/restaurants",
	},
	{
		title: "Dineinly Staff",
		description: "Manage Dineinly Admin access",
		icon: UserCog,
		href: "/admin/staff",
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
		<div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-8 sm:px-6 md:px-8 md:py-12 lg:px-12 lg:py-16">
			<header className="mb-10 flex flex-col gap-8 sm:mb-16 sm:gap-12">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<AnimatedBrandLogo height={31} priority />

					<AdminHeaderActions />
				</div>

				<h1 className="font-medium text-3xl text-primary sm:text-4xl lg:text-5xl">
					{getGreeting()}, {viewer?.displayName ?? "Admin"}.
				</h1>
			</header>

			<main className="grid flex-1 content-start gap-4 sm:gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
				{navCards.map(({ title, description, icon: Icon, href }) => {
					const cardClass =
						"group flex flex-col gap-4 rounded-xl border border-divider bg-surface p-6 text-left no-underline transition-colors duration-(--duration-base) ease-out sm:gap-6 sm:p-8";
					const content = (
						<>
							<Icon
								className="icon-xl text-secondary transition-colors duration-(--duration-base) ease-out group-hover:text-accent-hover group-focus-visible:text-accent-hover"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<div>
								<h2 className="text-lg text-primary">{title}</h2>
								<p className="mt-2 text-muted text-sm">{description}</p>
							</div>
						</>
					);

					return href ? (
						<Link
							key={title}
							href={href}
							className={`${cardClass} hover:bg-surface-elevated focus-visible:bg-surface-elevated`}
						>
							{content}
						</Link>
					) : (
						<div
							key={title}
							className={`${cardClass} cursor-not-allowed opacity-60`}
						>
							{content}
						</div>
					);
				})}
			</main>

			<SiteFooter variant="compact" className="mt-16 lg:mt-24" />
		</div>
	);
}
