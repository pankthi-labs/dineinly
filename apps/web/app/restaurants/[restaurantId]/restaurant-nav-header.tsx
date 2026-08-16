"use client";

import Link from "next/link";
import { AdminHeaderActions } from "@/app/admin/admin-header-actions";
import { PoweredByDineinly } from "@/components/brand-logo";
import { useIsAdmin } from "./viewer-context";

const NAV_ITEMS = [
	"Home",
	"Menu Desk",
	"Kitchen",
	"Table Matrix",
	"Staff Roster",
	"Venue Settings",
	"Bills",
] as const;
type NavItem = (typeof NAV_ITEMS)[number];

// Staff Roster and Venue Settings aren't built yet — they render inert.
const NAV_ROUTES: Partial<Record<NavItem, (restaurantId: string) => string>> = {
	Home: (restaurantId) => `/restaurants/${restaurantId}`,
	"Menu Desk": (restaurantId) => `/restaurants/${restaurantId}/menu`,
	Kitchen: (restaurantId) => `/restaurants/${restaurantId}/kitchen`,
	"Table Matrix": (restaurantId) => `/restaurants/${restaurantId}/tables`,
	Bills: (restaurantId) => `/restaurants/${restaurantId}/bills`,
};

export function RestaurantNavHeader({
	restaurantId,
	restaurantName,
	active,
}: {
	restaurantId: string;
	restaurantName: string;
	active: NavItem;
}) {
	const isAdmin = useIsAdmin();

	return (
		<header className="border-divider border-b bg-surface">
			<div className="flex flex-col gap-6 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-16 xl:px-24">
				<div>
					<p className="text-2xl text-primary">{restaurantName}</p>
					<PoweredByDineinly className="mt-1" />
				</div>
				<div className="flex min-w-0 items-center gap-6 lg:gap-8">
					<nav
						aria-label="Restaurant navigation"
						className="min-w-0 overflow-x-auto"
					>
						<ul className="flex min-w-max items-center gap-6 text-sm lg:gap-8">
							{NAV_ITEMS.map((item) => {
								const isActive = item === active;
								const route = NAV_ROUTES[item];
								const itemClass = isActive
									? "border-accent border-b-2 pb-2 font-semibold text-primary"
									: route
										? "font-medium text-muted transition-colors duration-(--duration-base) ease-out hover:text-secondary"
										: "cursor-not-allowed font-medium text-muted opacity-60";

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
					<div className="flex shrink-0 items-center gap-6 lg:gap-8">
						<AdminHeaderActions
							directoryHref={isAdmin ? "/admin/restaurants" : undefined}
						/>
					</div>
				</div>
			</div>
		</header>
	);
}
