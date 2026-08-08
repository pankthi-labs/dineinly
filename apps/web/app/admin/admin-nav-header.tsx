"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { AdminHeaderActions } from "./admin-header-actions";

const NAV_ITEMS = [
	"Restaurants Directory",
	"Dineinly Staff",
	"Dineinly Settings",
] as const;
type NavItem = (typeof NAV_ITEMS)[number];

// Only Restaurants Directory is built so far — the rest render inert.
const NAV_ROUTES: Partial<Record<NavItem, string>> = {
	"Restaurants Directory": "/admin/restaurants",
};

export function AdminNavHeader({ active }: { active: NavItem }) {
	return (
		<header className="border-divider border-b bg-surface">
			<div className="flex flex-col gap-6 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-16 xl:px-24">
				<BrandLogo height={28} />

				<div className="flex items-center gap-6 overflow-x-auto lg:gap-8">
					<nav aria-label="Admin navigation">
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
												href={route}
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
					<AdminHeaderActions />
				</div>
			</div>
		</header>
	);
}
