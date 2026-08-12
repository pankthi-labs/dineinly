"use client";

import type { LucideIcon } from "lucide-react";
import {
	BookOpen,
	ChefHat,
	LayoutGrid,
	Receipt,
	Store,
	Users,
} from "lucide-react";
import Link from "next/link";
import { AdminHeaderActions } from "@/app/admin/admin-header-actions";
import { PoweredByDineinly } from "@/components/brand-logo";
import { getGreeting } from "@/lib/greeting";
import { trpc } from "@/lib/trpc-client";
import { DirectoryLink } from "./restaurant-nav-header";

const navCards: Array<{
	title: string;
	description: string;
	icon: LucideIcon;
	// Cards without an href aren't built yet — rendered inert rather than
	// linking nowhere.
	href?: string;
}> = [
	{
		title: "Menu Desk",
		description: "Updates & specials",
		icon: BookOpen,
		href: "menu",
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
		href: "tables",
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

export function RestaurantHome({
	restaurantId,
	viewerName,
}: {
	restaurantId: string;
	viewerName: string;
}) {
	const restaurant = trpc.restaurants.getById.useQuery({ id: restaurantId });

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
						<DirectoryLink />
						<AdminHeaderActions showProfile />
					</div>
				</div>

				<h1 className="font-medium text-3xl text-primary sm:text-4xl lg:text-5xl">
					{getGreeting()}, {viewerName}.
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
							href={`/restaurants/${restaurantId}/${href}`}
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
