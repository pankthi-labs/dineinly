"use client";

import { ArrowLeftFromLine } from "lucide-react";
import Link from "next/link";
import { AdminHeaderActions } from "@/app/admin/admin-header-actions";
import { PoweredByDineinly } from "@/components/brand-logo";
import { useIsAdmin } from "./viewer-context";

const NAV_ITEMS = [
	"Home",
	"Menu Desk",
	"Table Matrix",
	"Staff Roster",
	"Venue Settings",
	"Bills",
] as const;
type NavItem = (typeof NAV_ITEMS)[number];

// Only Home and Menu Desk are built so far — the rest render inert.
const NAV_ROUTES: Partial<Record<NavItem, (restaurantId: string) => string>> = {
	Home: (restaurantId) => `/restaurants/${restaurantId}`,
	"Menu Desk": (restaurantId) => `/restaurants/${restaurantId}/menu`,
};

export function RestaurantNavHeader({
	restaurantId,
	restaurantName,
	active,
	showProfile = false,
}: {
	restaurantId: string;
	restaurantName: string;
	active: NavItem;
	showProfile?: boolean;
}) {
	return (
		<header className="border-divider border-b bg-surface">
			<div className="flex flex-col gap-6 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-16 xl:px-24">
				<div>
					<p className="text-2xl text-primary">{restaurantName}</p>
					<PoweredByDineinly className="mt-1.5" />
				</div>
				<div className="flex items-center gap-6 overflow-x-auto lg:gap-8">
					<nav aria-label="Restaurant navigation">
						<ul className="flex min-w-max items-center gap-6 text-sm lg:gap-8">
							{NAV_ITEMS.map((item) => {
								const isActive = item === active;
								const route = NAV_ROUTES[item];
								const itemClass = isActive
									? "border-accent border-b-2 pb-2 font-medium text-primary"
									: route
										? "text-muted transition-colors duration-(--duration-base) ease-out hover:text-secondary"
										: "cursor-not-allowed text-muted opacity-60";

								return (
									<li key={item}>
										{!isActive && route ? (
											<Link
												href={route(restaurantId)}
												className={`${itemClass} no-underline`}
											>
												{item}
											</Link>
										) : (
											<span
												aria-current={isActive ? "page" : undefined}
												className={itemClass}
											>
												{item}
											</span>
										)}
									</li>
								);
							})}
						</ul>
					</nav>
					<DirectoryLink />
					<AdminHeaderActions showProfile={showProfile} />
				</div>
			</div>
		</header>
	);
}

// Dineinly Admin only — a restaurant's own staff has no "directory" to
// leave to. Icon-only: this is a frequent, glance-only control, not a
// deliberate one, so it reads by shape (leave here) rather than by naming
// the destination.
export function DirectoryLink() {
	const isAdmin = useIsAdmin();
	if (!isAdmin) return null;

	return (
		<Link
			href="/admin/restaurants"
			aria-label="Restaurants Directory"
			title="Restaurants Directory"
			className="icon-tap-target flex items-center justify-center text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary"
		>
			<ArrowLeftFromLine
				className="icon-sm"
				strokeWidth={1.5}
				aria-hidden="true"
			/>
		</Link>
	);
}
