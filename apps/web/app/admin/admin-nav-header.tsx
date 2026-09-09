"use client";

import Link from "next/link";
import { BrandWordmark } from "@/components/brand-logo";
import { AdminHeaderActions } from "./admin-header-actions";

const NAV_ITEMS = [
	"Admin Home",
	"Restaurants Directory",
	"Dineinly Staff",
	"Dineinly Settings",
] as const;
type NavItem = (typeof NAV_ITEMS)[number];

// Dineinly Settings isn't built yet — it renders inert.
const NAV_ROUTES: Partial<Record<NavItem, string>> = {
	"Admin Home": "/admin",
	"Restaurants Directory": "/admin/restaurants",
	"Dineinly Staff": "/admin/staff",
};

export function AdminNavHeader({ active }: { active: NavItem }) {
	return (
		<header className="border-divider border-b bg-surface">
			<div className="flex flex-col gap-6 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-16 xl:px-24">
				<BrandWordmark height={28} />

				<div className="flex min-w-0 items-center gap-6 lg:gap-8">
					<nav
						aria-label="Admin navigation"
						className="no-scrollbar min-w-0 overflow-x-auto"
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
					<div className="flex shrink-0 items-center">
						<AdminHeaderActions />
					</div>
				</div>
			</div>
		</header>
	);
}
