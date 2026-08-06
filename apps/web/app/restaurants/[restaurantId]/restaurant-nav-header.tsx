"use client";

import Link from "next/link";
import { AdminHeaderActions } from "@/app/admin/admin-header-actions";
import { PoweredByDineinly } from "@/components/brand-logo";
import { useIsAdmin } from "./viewer-context";

// Only "Menu Desk" is built so far — the rest render inert.
const navigation = [
	"Overview",
	"Menu Desk",
	"Table Matrix",
	"Staff Roster",
	"Venue Settings",
	"Bills",
] as const;

export function RestaurantNavHeader({
	restaurantName,
	active,
}: {
	restaurantName: string;
	active: (typeof navigation)[number];
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
							{navigation.map((item) => (
								<li key={item}>
									<span
										aria-current={item === active ? "page" : undefined}
										className={
											item === active
												? "border-accent border-b-2 pb-2 font-medium text-primary"
												: "text-muted"
										}
									>
										{item}
									</span>
								</li>
							))}
						</ul>
					</nav>
					<AdminHeaderActions />
				</div>
			</div>
		</header>
	);
}

// Render as the first line inside the page's own <main>, not inside the header.
export function RestaurantBreadcrumb() {
	const isAdmin = useIsAdmin();
	if (!isAdmin) return null;

	return (
		<Link
			href="/admin/restaurants"
			className="text-caps text-secondary no-underline hover:text-primary"
		>
			← Restaurants Directory
		</Link>
	);
}
