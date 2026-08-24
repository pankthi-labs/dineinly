"use client";

import type { LucideIcon } from "lucide-react";
import {
	BookOpen,
	ChefHat,
	LayoutGrid,
	QrCode,
	Receipt,
	Store,
	Users,
} from "lucide-react";
import Link from "next/link";
import { AdminHeaderActions } from "@/app/admin/admin-header-actions";
import { PoweredByDineinly } from "@/components/brand-logo";
import { getGreeting } from "@/lib/greeting";
import { trpc } from "@/lib/trpc-client";
import {
	useCanAccessBills,
	useCanAccessSettings,
	useCanManageStaff,
	useIsAdmin,
	useIsMenuOnly,
} from "./viewer-context";

const CARD_TITLES = [
	"Menu Desk",
	"Kitchen",
	"Table Matrix",
	"QR Menu",
	"Staff Roster",
	"Venue Settings",
	"Bills",
] as const;
type CardTitle = (typeof CARD_TITLES)[number];

const navCards: Array<{
	title: CardTitle;
	description: string;
	icon: LucideIcon;
	// Cards without an href aren't built yet — rendered inert rather than
	// linking nowhere (no permission question, the page doesn't exist for
	// anyone). Staff Roster, Menu Desk, Table Matrix, Venue Settings, and
	// Bills are role-gated instead (docs/product.md § RBAC) — visibleCards
	// below drops the card entirely for a viewer without reach, same pattern
	// as restaurant-nav-header.tsx.
	href?: string;
}> = [
	{
		title: "Menu Desk",
		description: "Updates & specials",
		icon: BookOpen,
	},
	{
		title: "Kitchen",
		description: "Live order queue",
		icon: ChefHat,
		href: "kitchen",
	},
	{
		title: "Table Matrix",
		description: "Live seating status",
		icon: LayoutGrid,
	},
	{
		title: "QR Menu",
		description: "Your guest-facing QR",
		icon: QrCode,
	},
	{
		title: "Staff Roster",
		description: "Manage shifts & access",
		icon: Users,
	},
	{
		title: "Venue Settings",
		description: "Service charge & profile",
		icon: Store,
	},
	{
		title: "Bills",
		description: "Revenue & settlements",
		icon: Receipt,
	},
];

// Role-gated cards (docs/product.md § RBAC) resolve their route from the
// viewer's own `can*` flag; every other card either always links (Kitchen)
// or has no href yet (Venue Settings — unbuilt).
const GATED_CARD_ROUTES: Partial<Record<CardTitle, string>> = {
	"Menu Desk": "menu",
	"Table Matrix": "tables",
	"QR Menu": "qr",
	"Staff Roster": "staff",
	"Venue Settings": "settings",
	Bills: "bills",
};

export function RestaurantHome({
	restaurantId,
	viewerName,
}: {
	restaurantId: string;
	viewerName: string;
}) {
	const restaurant = trpc.restaurants.getById.useQuery({ id: restaurantId });
	const isAdmin = useIsAdmin();
	const canManageStaff = useCanManageStaff();
	const canManageMenuAndTables = canManageStaff;
	const canAccessBills = useCanAccessBills();
	const canAccessSettings = useCanAccessSettings();
	const isMenuOnly = useIsMenuOnly();
	const cardAccess: Partial<Record<CardTitle, boolean>> = {
		"Menu Desk": canManageMenuAndTables,
		// Dineinly Menu is view-only (docs/product.md § Dineinly Experiences)
		// — no tables, kitchen, or bills, for any role.
		Kitchen: !isMenuOnly,
		"Table Matrix": canManageMenuAndTables && !isMenuOnly,
		// The Menu package's one universal QR (docs/product.md § Dineinly
		// Experiences) — Table Matrix's full-service counterpart.
		"QR Menu": canManageMenuAndTables && isMenuOnly,
		"Staff Roster": canManageStaff,
		"Venue Settings": canAccessSettings,
		Bills: canAccessBills && !isMenuOnly,
	};
	const visibleCards = navCards.filter(
		(card) => !(card.title in cardAccess) || cardAccess[card.title],
	);

	if (restaurant.isPending) {
		return <HomeLoading />;
	}

	if (restaurant.isError) {
		return (
			<HomeError
				message={restaurant.error.message}
				onRetry={() => restaurant.refetch()}
			/>
		);
	}

	return (
		<div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-8 sm:px-6 md:px-8 md:py-12 lg:px-12 lg:py-16">
			<header className="mb-10 flex flex-col gap-8 sm:mb-16 sm:gap-12">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-2xl text-primary">{restaurant.data.name}</p>
						<PoweredByDineinly className="mt-1" />
					</div>

					<div className="flex items-center gap-4">
						<AdminHeaderActions
							directoryHref={isAdmin ? "/admin/restaurants" : undefined}
							restaurantId={isAdmin ? undefined : restaurantId}
						/>
					</div>
				</div>

				<h1 className="font-medium text-3xl text-primary sm:text-4xl lg:text-5xl">
					{getGreeting()}, {viewerName}.
				</h1>
			</header>

			<main className="grid flex-1 content-start gap-4 sm:gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
				{visibleCards.map(({ title, description, icon: Icon, href }) => {
					const resolvedHref = GATED_CARD_ROUTES[title] ?? href;
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

					return resolvedHref ? (
						<Link
							key={title}
							href={`/restaurants/${restaurantId}/${resolvedHref}`}
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

			<footer className="mt-16 border-divider border-t pt-8 lg:mt-24">
				<p className="text-caps text-muted">
					© {new Date().getFullYear()} Dineinly. All rights reserved.
				</p>
			</footer>
		</div>
	);
}

function HomeLoading() {
	return (
		<main className="flex min-h-dvh items-center bg-background px-4 text-primary lg:px-16 xl:px-24">
			<p className="text-muted">Loading restaurant…</p>
		</main>
	);
}

function HomeError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<main className="flex min-h-dvh items-center bg-background px-4 text-primary lg:px-16 xl:px-24">
			<div className="rounded-xl border border-divider bg-surface p-6">
				<p className="text-caps text-muted">Restaurant unavailable</p>
				<h1 className="mt-3 text-3xl">We couldn’t load this restaurant.</h1>
				<p className="prose mt-3 text-secondary text-sm">{message}</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-6 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm"
				>
					Try again
				</button>
			</div>
		</main>
	);
}
