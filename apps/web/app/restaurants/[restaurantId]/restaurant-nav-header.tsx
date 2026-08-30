"use client";

import Link from "next/link";
import { AdminHeaderActions } from "@/app/admin/admin-header-actions";
import { PoweredByDineinly } from "@/components/brand-logo";
import { titleCase } from "@/lib/format";
import {
	useCanAccessBills,
	useCanAccessSettings,
	useCanManageStaff,
	useCanPairDevice,
	useIsAdmin,
	useIsCounter,
	useIsIndividualWaiter,
	useIsMenuOnly,
} from "./viewer-context";

const NAV_ITEMS = [
	"Home",
	"Menu Desk",
	"Kitchen",
	"Table Matrix",
	"QR Menu",
	"Floor",
	"Staff Roster",
	"Venue Settings",
	"Bills",
] as const;
type NavItem = (typeof NAV_ITEMS)[number];

// Staff Roster, Menu Desk, Table Matrix, QR Menu, Bills, and Venue Settings
// are all role-gated (docs/product.md § RBAC) — a viewer without reach
// doesn't get a route their own page layout would just redirect away from,
// so RestaurantNavHeader below omits the item from the nav entirely rather
// than rendering it disabled.
const NAV_ROUTES: Partial<Record<NavItem, (restaurantId: string) => string>> = {
	Home: (restaurantId) => `/restaurants/${restaurantId}`,
	Kitchen: (restaurantId) => `/restaurants/${restaurantId}/kitchen`,
	"Menu Desk": (restaurantId) => `/restaurants/${restaurantId}/menu`,
	"Table Matrix": (restaurantId) => `/restaurants/${restaurantId}/tables`,
	"QR Menu": (restaurantId) => `/restaurants/${restaurantId}/qr`,
	Floor: (restaurantId) => `/restaurants/${restaurantId}/floor`,
	"Staff Roster": (restaurantId) => `/restaurants/${restaurantId}/staff`,
	"Venue Settings": (restaurantId) => `/restaurants/${restaurantId}/settings`,
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
	const canManageStaff = useCanManageStaff();
	const canManageMenuAndTables = canManageStaff;
	const canAccessBills = useCanAccessBills();
	const canAccessSettings = useCanAccessSettings();
	const isMenuOnly = useIsMenuOnly();
	const isCounter = useIsCounter();
	const isIndividualWaiter = useIsIndividualWaiter();
	const canPairDevice = useCanPairDevice();
	const gatedItems: Partial<Record<NavItem, boolean>> = {
		"Menu Desk": canManageMenuAndTables,
		// Dineinly Menu is view-only (docs/product.md § Dineinly Experiences)
		// — no tables, kitchen, floor, or bills, for any role.
		Kitchen: !isMenuOnly,
		// Counter has zero Restaurant Table rows (docs/product.md § Dineinly
		// Experiences) — no Table Matrix or Floor either, same as Menu.
		"Table Matrix": canManageMenuAndTables && !isMenuOnly && !isCounter,
		// Menu and Counter share one universal QR instead of per-table ones —
		// Table Matrix's counterpart for both.
		"QR Menu": canManageMenuAndTables && (isMenuOnly || isCounter),
		// Floor (Order on behalf of guest, Merge Tables — docs/product.md §
		// RBAC) is Waiter/Manager/Owner, same reach as Bills.
		Floor: canAccessBills && !isMenuOnly && !isCounter,
		"Staff Roster": canManageStaff,
		"Venue Settings": canAccessSettings,
		Bills: canAccessBills && !isMenuOnly,
	};
	// A named Waiter's own OTP session is account-management only — Home and
	// nothing else. Real floor work happens on a paired station device
	// instead (useIsIndividualWaiter's doc comment).
	const visibleItems: NavItem[] = isIndividualWaiter
		? ["Home"]
		: NAV_ITEMS.filter((item) => !(item in gatedItems) || gatedItems[item]);

	return (
		<header className="border-divider border-b bg-surface">
			<div className="flex flex-col gap-6 px-4 py-5 md:flex-row md:items-center md:justify-between md:px-16 xl:px-24">
				<div>
					<p className="text-2xl text-primary">{titleCase(restaurantName)}</p>
					<PoweredByDineinly className="mt-1" />
				</div>
				<div className="flex min-w-0 items-center gap-6 lg:gap-8">
					<nav
						aria-label="Restaurant navigation"
						className="no-scrollbar min-w-0 overflow-x-auto"
					>
						<ul className="flex min-w-max items-center gap-6 text-sm lg:gap-8">
							{visibleItems.map((item) => {
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
							restaurantId={isAdmin ? undefined : restaurantId}
							isMenuOnly={isMenuOnly}
							canPairDevice={canPairDevice}
						/>
					</div>
				</div>
			</div>
		</header>
	);
}
