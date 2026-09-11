"use client";

import { Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PoweredByDineinly } from "@/components/brand-logo";
import { CollapsibleSearch } from "@/components/collapsible-search";
import { Detail } from "@/components/detail";
import { DietMark } from "@/components/diet-mark";
import { FormSheet } from "@/components/form-sheet";
import {
	GuestError,
	GuestLoading,
	NoGuestSession,
} from "@/components/guest-page-states";
import { QuantityPill } from "@/components/quantity-pill";
import { SiteFooter } from "@/components/site-footer";
import {
	COUNTER_STATUS_LABEL,
	counterOrderStatus,
} from "@/lib/counter-order-status";
import { capitalizeFirst, formatPrice, titleCase } from "@/lib/format";
import { formatScheduleLabel } from "@/lib/menu-item-schedule";
import {
	ICE_LABELS,
	ICE_OPTIONS,
	type PREP_TIME_OPTIONS,
	SALT_OPTIONS,
	SERVING_SIZE_LABELS,
	type SERVING_SIZE_OPTIONS,
	SPICE_OPTIONS,
} from "@/lib/menu-options";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { useGuestRealtime } from "@/lib/realtime/use-guest-realtime";
import { trpc } from "@/lib/trpc-client";

type MenuItem = {
	id: string;
	category_id: string;
	name: string;
	description: string | null;
	price: number;
	diet: "veg" | "non_veg";
	availability: "available" | "sold_out";
	schedule_days: number[] | null;
	schedule_start_time: string | null;
	schedule_end_time: string | null;
	scheduleActive: boolean;
	labels: string[];
	prep_time: (typeof PREP_TIME_OPTIONS)[number];
	serving_size: (typeof SERVING_SIZE_OPTIONS)[number];
	offers_spice: boolean;
	offers_salt: boolean;
	offers_ice: boolean;
};

// Sold-out and out-of-schedule both mean "can't order this right now" — same
// dimmed-card, badge-instead-of-price treatment, and both sink to the end of
// their category below (visibleCategories) rather than sitting mixed in
// alphabetically among items the guest can actually order.
function isMenuItemUnavailable(item: MenuItem): boolean {
	return item.availability === "sold_out" || !item.scheduleActive;
}

/** "Sold out" for the manual toggle, else the schedule window — always
 * present when scheduleActive is false, since a schedule is the only other
 * way to reach this state. */
function unavailableLabel(item: MenuItem): string {
	return item.availability === "sold_out"
		? "Sold out"
		: (formatScheduleLabel({
				schedule_days: item.schedule_days,
				schedule_start_time: item.schedule_start_time,
				schedule_end_time: item.schedule_end_time,
			}) ?? "Currently unavailable");
}

const FASTEST_PREP_TIME: (typeof PREP_TIME_OPTIONS)[number] = "5-10 mins";

const HALF_HOUR_MS = 30 * 60 * 1000;

// Dineinly Menu (view-only, docs/product.md § Dineinly Experiences) has no
// order/bill to protect, so unlike Guest/One/Counter its session ends the
// moment nobody's actually looking, rather than riding out the full guest
// token TTL (lib/guest-token.ts's GUEST_TOKEN_MENU_TTL_SECONDS).
const MENU_IDLE_MS = 10 * 60 * 1000;

// Restaurant-authored label text is open vocabulary (docs/core-data-model.md
// — Owner/Manager types it freely from Menu Desk), so this can only cover
// the common cases with a premium-reading kicker phrase; anything else
// still gets a kicker (title-cased), just not this bespoke wording.
const LABEL_KICKERS: Record<string, string> = {
	"chef special": "Chef Recommends",
	"chef recommended": "Chef Recommends",
	bestseller: "Guest Favorite",
	seasonal: "Seasonal Selection",
	spicy: "Spicy Pick",
	new: "Newly Added",
};

function labelKicker(label: string): string {
	return LABEL_KICKERS[label.toLowerCase()] ?? titleCase(label);
}

// Guest's first screen after scanning a table QR (app/qr/[qrToken]/route.ts
// redirects here). Phone-only — docs/design-system.md § 10: guest-facing
// ordering flows never assume anything above --breakpoint-sm.
export default function GuestMenuPage() {
	const router = useRouter();
	const menu = trpc.guest.menu.useQuery(undefined, { retry: false });
	const utils = trpc.useUtils();
	// docs/product.md § Dineinly Experiences: Menu is view-only (no cart, no
	// order history at all). Guest and One both order and can view order
	// history — Guest's history just has no live status/bill (guest/orders
	// handles that split). Server-enforced too (guest.ts) — this only decides
	// what renders.
	const orderingEnabled = menu.data?.restaurant.experience !== "menu";
	// Shared cart — another guest at the table can add/edit lines this device
	// never mutated, so this relies on the session:{id} broadcast below
	// rather than only its own mutations to stay current.
	const cart = trpc.guest.cart.list.useQuery(undefined, {
		enabled: menu.isSuccess && orderingEnabled,
	});
	const addItem = trpc.guest.cart.addItem.useMutation({
		onSuccess: () => utils.guest.cart.list.invalidate(),
	});
	const setQuantity = trpc.guest.cart.setQuantity.useMutation({
		onSuccess: () => utils.guest.cart.list.invalidate(),
	});
	const orders = trpc.guest.orders.list.useQuery(undefined, {
		enabled: menu.isSuccess && orderingEnabled,
	});
	const hasOrders = (orders.data?.length ?? 0) > 0;
	// Counter's "My Orders" link doubles as a status readout — Full-Service
	// (one) and Guest never show this, since Counter is the only experience
	// whose guest-facing status can be "Awaiting Payment" before the kitchen
	// has even started (docs/core-data-model.md § Lifecycle invariants).
	const isCounter = menu.data?.restaurant.experience === "counter";
	const bill = trpc.guest.bill.get.useQuery(undefined, {
		enabled: menu.isSuccess && isCounter,
	});
	const myOrdersStatus =
		isCounter && orders.data && orders.data.length > 0
			? COUNTER_STATUS_LABEL[
					counterOrderStatus(
						orders.data.flatMap((order) => order.items),
						bill.data?.status === "settled",
					)
				]
			: null;

	const { client, restaurantId, sessionId } = useGuestRealtime();
	useBroadcastChannel(client, sessionId ? `session:${sessionId}` : null, {
		"cart_item.change": () => utils.guest.cart.list.invalidate(),
		// Counter's "My Orders" badge (myOrdersStatus below) reads order/bill
		// status live — without these, kitchen marking an item Ready never
		// reaches this page until the guest happens to navigate elsewhere and
		// back (app/guest/orders/page.tsx and app/guest/bill/page.tsx already
		// subscribe to all three; this page only had cart_item.change before).
		"order.new": () => {
			utils.guest.orders.list.invalidate();
			utils.guest.bill.get.invalidate();
		},
		"order_item.status": () => {
			utils.guest.orders.list.invalidate();
			utils.guest.bill.get.invalidate();
		},
		// Settling flips which of this session's items guest.orders.list even
		// returns (Counter-experience gate: an item stays hidden from "My
		// Orders" until its own bill is settled) — bill.get alone leaves the
		// status badge above stuck at "Awaiting Payment" until something else
		// happens to refetch orders.list.
		"bill.status": () => {
			utils.guest.bill.get.invalidate();
			utils.guest.orders.list.invalidate();
		},
	});
	useBroadcastChannel(client, restaurantId ? `menu:${restaurantId}` : null, {
		"menu_item.change": () => utils.guest.menu.invalidate(),
		"menu_category.change": () => utils.guest.menu.invalidate(),
		// Owner regenerated the QR (supabase/migrations/..._policies.sql's
		// regenerate_qr_token already closed this tab's session, for Menu
		// restaurants) — still subscribed to this topic since
		// can_access_menu_topic only checks restaurant_id, not session
		// liveness, so this fires even on an already-revoked session.
		// Re-fetching now reads null under RLS and falls into
		// RestaurantUnavailable below, instead of sitting on a stale menu
		// until the guest happens to reload. A no-op refetch for Counter,
		// whose sessions regenerate_qr_token leaves open.
		"qr.regenerated": () => utils.guest.menu.invalidate(),
	});

	// Card quick-add/stepper writes/edits the *last* cart line for a menu
	// item — for an item with no preferences there's only ever one line, so
	// this is just "the line"; for one with preferences, this reuses
	// whichever spice/salt/ice combo the guest most recently chose in the
	// drawer rather than asking again on every tap.
	const cartRowsByMenuItem = useMemo(() => {
		const map = new Map<string, NonNullable<typeof cart.data>>();
		for (const row of cart.data ?? []) {
			const list = map.get(row.menuItemId) ?? [];
			list.push(row);
			map.set(row.menuItemId, list);
		}
		return map;
	}, [cart.data]);

	const cartCount = (cart.data ?? []).reduce(
		(sum, row) => sum + row.quantity,
		0,
	);

	// Already-ordered quantity per menu item, merged into the card's stepper
	// so a guest who confirmed a round and came back for more still sees what
	// they already have instead of a stepper reset to 0 (the cart itself is
	// cleared on confirm — see submit_order()). Counter only: it reuses the
	// current bill while still unsettled (draws a fresh one once it settles),
	// so this round's quantity is a meaningful, bounded number. One/Guest has
	// no such round boundary — every dish ordered for the whole visit would
	// stay merged in forever, including one served and eaten an hour ago —
	// so the stepper there stays live-cart-only, as before.
	const alreadyOrderedByMenuItem = useMemo(() => {
		const map = new Map<string, number>();
		if (isCounter && bill.data && bill.data.status !== "settled") {
			for (const [menuItemId, quantity] of Object.entries(
				bill.data.itemQuantitiesByMenuItem,
			)) {
				map.set(menuItemId, quantity);
			}
		}
		return map;
	}, [isCounter, bill.data]);

	const [search, setSearch] = useState("");
	const [activeDiets, setActiveDiets] = useState<Array<"veg" | "non_veg">>([]);
	const [expressOnly, setExpressOnly] = useState(false);
	const [sharingOnly, setSharingOnly] = useState(false);
	const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
	const [openItem, setOpenItem] = useState<MenuItem | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const stickyRef = useRef<HTMLDivElement>(null);
	const [stickyHeight, setStickyHeight] = useState(0);

	// Category sections use this as scroll-margin-top so tapping a nav tab
	// lands the heading just below the sticky header instead of underneath
	// it — recalculated on resize/content change since the header's own
	// height varies (search-open state, nav tabs, filter row).
	useEffect(() => {
		const node = stickyRef.current;
		if (!node) return;
		const observer = new ResizeObserver((entries) => {
			setStickyHeight(entries[0]?.contentRect.height ?? 0);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const endSession = trpc.guest.endSession.useMutation();

	// Scheduled items flip availability only at a schedule boundary, and every
	// boundary a schedule can define sits on a half hour (TIME_OPTIONS in
	// menu-item-schedule.ts) — so re-checking on that same cadence is exact,
	// not a heuristic poll. A recursive setTimeout (not setInterval) recomputes
	// the delay to the next boundary from the actual current time on every
	// firing, so a throttled/backgrounded tab self-corrects to the real
	// boundary on its next wake instead of drifting. Invalidating (not
	// refetching directly) re-uses the same query-client path the realtime
	// broadcast handlers below already use, so an in-flight request never
	// gets clobbered by a redundant one.
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		function scheduleNextTick() {
			const delay = HALF_HOUR_MS - (Date.now() % HALF_HOUR_MS);
			timer = setTimeout(() => {
				utils.guest.menu.invalidate();
				scheduleNextTick();
			}, delay);
		}
		scheduleNextTick();
		return () => clearTimeout(timer);
	}, [utils.guest.menu.invalidate]);

	useEffect(() => {
		if (orderingEnabled) return;
		let timer: ReturnType<typeof setTimeout>;
		function reset() {
			clearTimeout(timer);
			timer = setTimeout(() => endSession.mutate(), MENU_IDLE_MS);
		}
		// No visibilitychange listener: a backgrounded/hidden tab already stops
		// producing these events on its own, so it idles out within the same
		// window instead of needing separate handling.
		const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
		for (const event of events) {
			window.addEventListener(event, reset, { passive: true });
		}
		reset();
		return () => {
			clearTimeout(timer);
			for (const event of events) window.removeEventListener(event, reset);
		};
	}, [orderingEnabled, endSession.mutate]);

	const hasFilters =
		search.trim() !== "" ||
		activeDiets.length > 0 ||
		expressOnly ||
		sharingOnly;

	const visibleCategories = useMemo(() => {
		if (!menu.data) return [];
		const query = search.trim().toLowerCase();
		return menu.data.categories
			.map((category) => ({
				...category,
				// Stable sort (spec-guaranteed) — keeps the server's alphabetical
				// order within the available group and within the unavailable
				// group, just moving unavailable items as a block to the end.
				items: category.items
					.filter((item) => {
						if (query && !item.name.toLowerCase().includes(query)) return false;
						if (activeDiets.length > 0 && !activeDiets.includes(item.diet))
							return false;
						if (expressOnly && item.prep_time !== FASTEST_PREP_TIME)
							return false;
						if (sharingOnly && item.serving_size === "serves 1") return false;
						return true;
					})
					.sort(
						(a, b) =>
							Number(isMenuItemUnavailable(a)) -
							Number(isMenuItemUnavailable(b)),
					),
			}))
			.filter((category) => category.items.length > 0);
	}, [menu.data, search, activeDiets, expressOnly, sharingOnly]);

	// Each pill's own presence, independent of which filters are currently
	// active — a filter only earns a pill if it splits the menu; one that's
	// true (or false) for every item can't distinguish anything.
	const allItems = useMemo(
		() => menu.data?.categories.flatMap((category) => category.items) ?? [],
		[menu.data],
	);
	const dietIsMixed =
		allItems.some((item) => item.diet === "veg") &&
		allItems.some((item) => item.diet === "non_veg");
	const hasExpress =
		allItems.some((item) => item.prep_time === FASTEST_PREP_TIME) &&
		allItems.some((item) => item.prep_time !== FASTEST_PREP_TIME);
	const hasSharing =
		allItems.some((item) => item.serving_size !== "serves 1") &&
		allItems.some((item) => item.serving_size === "serves 1");

	function toggleDiet(diet: "veg" | "non_veg") {
		setActiveDiets((current) =>
			current.includes(diet)
				? current.filter((value) => value !== diet)
				: [...current, diet],
		);
	}

	function clearFilters() {
		setSearch("");
		setActiveDiets([]);
		setExpressOnly(false);
		setSharingOnly(false);
	}

	// scrollIntoView's own scroll-margin-top handling is unreliable under a
	// sticky header on mobile Safari — it can land short of or past the
	// heading. Computing the target offset directly and scrolling to it is
	// deterministic across browsers.
	function jumpToCategory(categoryId: string) {
		setActiveCategoryId(categoryId);
		const node = document.getElementById(`category-${categoryId}`);
		if (!node) return;
		// Measured live rather than trusting the `stickyHeight` state — that
		// state only updates after a ResizeObserver callback lands, so a click
		// landing before it catches up would undershoot the real bar height
		// and the heading would land partly hidden underneath it.
		const offset = stickyRef.current?.getBoundingClientRect().height ?? 0;
		const top = node.getBoundingClientRect().top + window.scrollY - offset;
		window.scrollTo({ top, behavior: "smooth" });
	}

	if (menu.isLoading) return <GuestLoading message="Loading menu…" />;
	if (menu.error?.data?.code === "UNAUTHORIZED") return <NoGuestSession />;
	if (menu.error)
		return (
			<GuestError
				message="We couldn't load this menu."
				onRetry={() => menu.refetch()}
			/>
		);
	if (!menu.data) return <RestaurantUnavailable />;

	const defaultCategoryId = menu.data.categories[0]?.id;

	return (
		<div className="min-h-dvh bg-background text-primary">
			<div
				ref={stickyRef}
				className="sticky top-0 z-(--z-sticky) bg-background will-change-transform"
			>
				{/* The table label and the search button form one tight right-hand
				cluster (gap-1) so the restaurant name — the longest, most variable
				string here — keeps the rest of the row. */}
				<header className="flex items-center gap-1 px-5 pt-6 pb-4">
					{searchOpen ? null : (
						<>
							<div className="min-w-0 flex-1">
								<h1 className="text-2xl">
									{titleCase(menu.data.restaurant.name)}
								</h1>
								<PoweredByDineinly className="mt-1" />
							</div>
							{/* Dineinly Menu's QR is universal, not per-table (docs/product.md
							§ Dineinly Experiences) — nothing to label here. */}
							{orderingEnabled && menu.data.tableLabel ? (
								<p className="shrink-0 rounded-pill border border-divider px-3 py-1 text-caps text-secondary">
									Table {menu.data.tableLabel}
								</p>
							) : null}
						</>
					)}
					<CollapsibleSearch
						value={search}
						onChange={setSearch}
						label="Search dishes"
						onOpenChange={setSearchOpen}
					/>
				</header>

				{menu.data.categories.length > 1 ? (
					<nav
						aria-label="Menu categories"
						className="no-scrollbar flex flex-nowrap gap-6 overflow-x-auto px-5 pb-4"
					>
						{menu.data.categories.map((category) => (
							<button
								key={category.id}
								type="button"
								onClick={() => jumpToCategory(category.id)}
								className={`shrink-0 border-b-2 pb-1 text-sm transition-colors duration-(--duration-base) ease-out ${
									(activeCategoryId ?? defaultCategoryId) === category.id
										? "border-accent text-primary"
										: "border-transparent text-secondary hover:text-primary"
								}`}
							>
								{titleCase(category.name)}
							</button>
						))}
					</nav>
				) : null}

				{dietIsMixed || hasExpress || hasSharing ? (
					<div className="no-scrollbar flex flex-nowrap gap-3 overflow-x-auto px-5 pb-4">
						{dietIsMixed ? (
							<FilterPill
								active={activeDiets.includes("veg")}
								onClick={() => toggleDiet("veg")}
							>
								Veg
							</FilterPill>
						) : null}
						{dietIsMixed ? (
							<FilterPill
								active={activeDiets.includes("non_veg")}
								onClick={() => toggleDiet("non_veg")}
							>
								Non-Veg
							</FilterPill>
						) : null}
						{hasExpress ? (
							<FilterPill
								active={expressOnly}
								onClick={() => setExpressOnly((value) => !value)}
							>
								Quick Serve
							</FilterPill>
						) : null}
						{hasSharing ? (
							<FilterPill
								active={sharingOnly}
								onClick={() => setSharingOnly((value) => !value)}
							>
								Made to Share
							</FilterPill>
						) : null}
					</div>
				) : null}
			</div>

			<main
				className={`px-5 pt-2 ${cartCount > 0 || hasOrders ? "pb-24" : "pb-16"}`}
			>
				{visibleCategories.length === 0 ? (
					<NoMatches hasFilters={hasFilters} onClear={clearFilters} />
				) : (
					visibleCategories.map((category) => (
						<section
							key={category.id}
							id={`category-${category.id}`}
							className="pt-8 first:pt-2"
							style={{ scrollMarginTop: stickyHeight }}
						>
							<h2 className="text-primary text-xl">
								{titleCase(category.name)}
							</h2>
							<div className="mt-4 flex flex-col gap-4">
								{category.items.map((item) => {
									const rows = cartRowsByMenuItem.get(item.id) ?? [];
									const cartQuantity = rows.reduce(
										(sum, row) => sum + row.quantity,
										0,
									);
									const lastRow = rows[rows.length - 1];
									const alreadyOrdered =
										alreadyOrderedByMenuItem.get(item.id) ?? 0;
									return (
										<MenuItemCard
											key={item.id}
											item={item}
											showDietMark={dietIsMixed}
											onOpen={() => setOpenItem(item)}
											orderingEnabled={orderingEnabled}
											cartQuantity={cartQuantity + alreadyOrdered}
											disableDecrement={cartQuantity === 0}
											onAdd={() =>
												addItem.mutate({
													menuItemId: item.id,
													quantity: 1,
													spice:
														(lastRow?.spice as
															| (typeof SPICE_OPTIONS)[number]
															| null) ?? undefined,
													salt:
														(lastRow?.salt as
															| (typeof SALT_OPTIONS)[number]
															| null) ?? undefined,
													ice:
														(lastRow?.ice as
															| (typeof ICE_OPTIONS)[number]
															| null) ?? undefined,
												})
											}
											onDecrement={() => {
												if (!lastRow) return;
												setQuantity.mutate({
													cartItemId: lastRow.id,
													quantity: lastRow.quantity - 1,
												});
											}}
										/>
									);
								})}
							</div>
						</section>
					))
				)}

				<SiteFooter variant="compact" className="mt-12" />

				{/* Without this, a category near the end of the list can't scroll far
				enough for its heading to clear the sticky header — the page runs
				out of content below it, so jumpToCategory's target position gets
				clamped short and the section lands mid-screen instead of at the
				top. Only needed when the category nav (jumpToCategory's only
				caller) actually renders — a single-category menu has no jump
				target and shouldn't pay for a viewport of dead space after the
				footer. */}
				{menu.data.categories.length > 1 ? (
					<div
						aria-hidden="true"
						style={{ height: `calc(100dvh - ${stickyHeight}px)` }}
					/>
				) : null}
			</main>

			{openItem ? (
				<MenuItemDrawer
					key={openItem.id}
					item={openItem}
					onClose={() => setOpenItem(null)}
					orderingEnabled={orderingEnabled}
					onAddToOrder={(input) =>
						addItem.mutateAsync({ menuItemId: openItem.id, ...input })
					}
				/>
			) : null}

			{cartCount > 0 || hasOrders ? (
				<div className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-divider border-t bg-surface-elevated px-5 py-4">
					<div
						className={`flex items-center gap-4 ${cartCount === 0 ? "justify-center" : ""}`}
					>
						{hasOrders ? (
							<button
								type="button"
								onClick={() =>
									router.push(isCounter ? "/guest/bill" : "/guest/orders")
								}
								className="-my-3 py-3 font-semibold text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
							>
								My Orders{myOrdersStatus ? ` · ${myOrdersStatus}` : ""}
							</button>
						) : null}
						{cartCount > 0 ? (
							<button
								type="button"
								onClick={() => router.push("/guest/cart")}
								className="ml-auto rounded-md bg-accent px-6 py-4 font-medium text-background text-sm"
							>
								Review Order ({cartCount})
							</button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

function MenuItemCard({
	item,
	showDietMark,
	onOpen,
	orderingEnabled,
	cartQuantity,
	disableDecrement,
	onAdd,
	onDecrement,
}: {
	item: MenuItem;
	showDietMark: boolean;
	onOpen: () => void;
	orderingEnabled: boolean;
	cartQuantity: number;
	disableDecrement: boolean;
	onAdd: () => void;
	onDecrement: () => void;
}) {
	const unavailable = isMenuItemUnavailable(item);
	const kicker = item.labels[0] ? labelKicker(item.labels[0]) : null;
	let priceClassName: string;
	if (!orderingEnabled && !unavailable && item.description) {
		// Only spans+centers across both rows when there's a description to
		// center against — with no second row of content, centering here
		// would float the price off the name's line instead of aligning to it.
		priceClassName =
			"row-span-2 self-center justify-self-end whitespace-nowrap text-2xl text-accent";
	} else if (!orderingEnabled && !unavailable) {
		priceClassName =
			"self-start justify-self-end whitespace-nowrap text-2xl text-accent";
	} else {
		priceClassName = `self-start justify-self-end whitespace-nowrap text-xl ${orderingEnabled ? "text-primary" : "text-accent"}`;
	}
	return (
		<div
			className={`rounded-xl border border-divider bg-surface p-5 ${unavailable ? "opacity-60" : ""}`}
		>
			{kicker ? (
				<p className="text-accent-secondary text-caps">{kicker}</p>
			) : null}
			{/* Two rows — name/price, then description/action — shared across
			both columns: the text button spans both and re-uses the card
			grid's rows (grid-rows-subgrid), so the price always sits on the
			name's first line and the pill always sits on the description's
			first line no matter how many lines the name wraps to. */}
			<div
				className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 ${kicker ? "mt-1" : ""}`}
			>
				<button
					type="button"
					onClick={onOpen}
					className="row-span-2 grid min-w-0 grid-rows-subgrid text-left"
				>
					{/* Diet mark rides the heading's first line as an inline box,
					so a wrapped name can't drag it to the block's center. */}
					<h3 className="min-w-0 text-primary text-xl">
						{showDietMark ? (
							<span className="mr-2 inline-block align-middle">
								<DietMark diet={item.diet} />
							</span>
						) : null}
						{titleCase(item.name)}
					</h3>
					{item.description ? (
						<p className="prose text-secondary text-sm">
							{capitalizeFirst(item.description)}
						</p>
					) : null}
				</button>
				{/* No add control on a view-only, in-stock menu item (Dineinly Menu
				package) — the price is the row's one point of emphasis, so it
				takes the gold accent and grows into the space an add control
				would otherwise fill, centered across both grid rows instead of
				pinned to the name's line. Sold-out items keep the compact
				top-row spot so "Sold out" still has row two to sit in. */}
				<span className={priceClassName}>{formatPrice(item.price)}</span>
				{unavailable ? (
					<span className="self-start justify-self-end text-right text-caps text-muted">
						{unavailableLabel(item)}
					</span>
				) : orderingEnabled ? (
					// One control for both states — at quantity 0 it renders
					// "Add" itself, so tapping it can never resize the row.
					<div className="self-start justify-self-end">
						<QuantityPill
							value={cartQuantity}
							disableDecrement={disableDecrement}
							onDecrement={onDecrement}
							onIncrement={onAdd}
						/>
					</div>
				) : null}
			</div>
		</div>
	);
}

function QuantityStepper({
	value,
	onDecrement,
	onIncrement,
	disableDecrement = false,
}: {
	value: number;
	onDecrement: () => void;
	onIncrement: () => void;
	disableDecrement?: boolean;
}) {
	return (
		<div className="flex shrink-0 items-center gap-2 rounded-pill border border-accent px-2 py-1">
			<button
				type="button"
				aria-label="Decrease quantity"
				disabled={disableDecrement}
				onClick={onDecrement}
				className="icon-tap-target text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary disabled:cursor-not-allowed disabled:text-muted"
			>
				<Minus className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
			</button>
			<span className="w-4 text-center text-accent text-base">{value}</span>
			<button
				type="button"
				aria-label="Increase quantity"
				onClick={onIncrement}
				className="icon-tap-target text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary"
			>
				<Plus className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
			</button>
		</div>
	);
}

function MenuItemDrawer({
	item,
	onClose,
	orderingEnabled,
	onAddToOrder,
}: {
	item: MenuItem;
	onClose: () => void;
	orderingEnabled: boolean;
	onAddToOrder: (input: {
		quantity: number;
		spice?: (typeof SPICE_OPTIONS)[number];
		salt?: (typeof SALT_OPTIONS)[number];
		ice?: (typeof ICE_OPTIONS)[number];
	}) => Promise<unknown>;
}) {
	const unavailable = isMenuItemUnavailable(item);
	const kicker = item.labels[0] ? labelKicker(item.labels[0]) : null;
	const [quantity, setQuantity] = useState(1);
	const [spice, setSpice] = useState<(typeof SPICE_OPTIONS)[number]>("regular");
	const [salt, setSalt] = useState<(typeof SALT_OPTIONS)[number]>("regular");
	const [ice, setIce] = useState<(typeof ICE_OPTIONS)[number]>("regular");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Dineinly Menu is view-only (orderingEnabled false) — spice/salt/ice
	// only mean anything at order time, so they're never shown there even if
	// the dish itself offers them.
	const hasPreferences =
		orderingEnabled &&
		(item.offers_spice || item.offers_salt || item.offers_ice);

	async function handleAddToOrder() {
		setIsSubmitting(true);
		setError(null);
		try {
			await onAddToOrder({
				quantity,
				spice: item.offers_spice ? spice : undefined,
				salt: item.offers_salt ? salt : undefined,
				ice: item.offers_ice ? ice : undefined,
			});
			onClose();
		} catch {
			setError("Couldn't add this to your order. Try again.");
			setIsSubmitting(false);
		}
	}

	return (
		<FormSheet
			title={titleCase(item.name)}
			onClose={onClose}
			hideHeader
			isSubmitting={isSubmitting}
			footer={
				unavailable ? (
					<p className="text-center text-caps text-muted">
						{unavailableLabel(item)}
					</p>
				) : !orderingEnabled ? undefined : (
					<div className="flex flex-col gap-3">
						{error ? (
							<p className="text-center text-error text-sm">{error}</p>
						) : null}
						<div className="flex items-center gap-4">
							<QuantityStepper
								value={quantity}
								disableDecrement={quantity <= 1}
								onDecrement={() =>
									setQuantity((value) => Math.max(1, value - 1))
								}
								onIncrement={() => setQuantity((value) => value + 1)}
							/>
							<button
								type="button"
								onClick={handleAddToOrder}
								disabled={isSubmitting}
								className="flex-1 rounded-md bg-accent px-6 py-4 font-medium text-background text-base disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isSubmitting ? "Adding…" : "Add to Cart"}
							</button>
						</div>
					</div>
				)
			}
		>
			<div className="flex flex-col gap-6">
				<div>
					{kicker ? (
						<p className="text-accent-secondary text-caps">{kicker}</p>
					) : null}
					<div className="mt-2 flex items-start justify-between gap-4">
						<h2 className="min-w-0 text-3xl text-primary">
							{titleCase(item.name)}
						</h2>
						<span className="shrink-0 text-2xl text-accent">
							{formatPrice(item.price)}
						</span>
					</div>
				</div>

				{item.description ? (
					<p className="prose text-base text-secondary">
						{capitalizeFirst(item.description)}
					</p>
				) : null}

				<div className="border-divider border-t" aria-hidden="true" />

				<div className="grid grid-cols-3 gap-4">
					<Detail label="Ready in" value={titleCase(item.prep_time)} />
					<Detail
						label="Serving size"
						value={SERVING_SIZE_LABELS[item.serving_size]}
					/>
					<Detail
						label="Diet"
						value={item.diet === "veg" ? "Vegetarian" : "Non-vegetarian"}
					/>
				</div>

				{hasPreferences ? (
					<>
						<div className="border-divider border-t" aria-hidden="true" />
						<div className="flex flex-col gap-6">
							{item.offers_spice ? (
								<PreferencePicker
									title="Spice Preference"
									options={SPICE_OPTIONS}
									value={spice}
									onChange={setSpice}
									labelFor={titleCase}
								/>
							) : null}
							{item.offers_salt ? (
								<PreferencePicker
									title="Salt Preference"
									options={SALT_OPTIONS}
									value={salt}
									onChange={setSalt}
									labelFor={titleCase}
								/>
							) : null}
							{item.offers_ice ? (
								<PreferencePicker
									title="Ice Preference"
									options={ICE_OPTIONS}
									value={ice}
									onChange={setIce}
									labelFor={(option) => ICE_LABELS[option]}
								/>
							) : null}
						</div>
					</>
				) : null}
			</div>
		</FormSheet>
	);
}

function PreferencePicker<T extends string>({
	title,
	options,
	value,
	onChange,
	labelFor,
}: {
	title: string;
	options: readonly T[];
	value: T;
	onChange: (value: T) => void;
	labelFor: (value: T) => string;
}) {
	return (
		<div>
			<h3 className="text-lg text-primary">{title}</h3>
			<div className="mt-3 flex flex-wrap gap-3">
				{options.map((option) => (
					<button
						key={option}
						type="button"
						onClick={() => onChange(option)}
						aria-pressed={value === option}
						className={`rounded-pill border bg-surface-elevated px-5 py-3 text-sm transition-colors duration-(--duration-base) ease-out ${
							value === option
								? "border-accent text-primary"
								: "border-transparent text-secondary hover:text-primary"
						}`}
					>
						{labelFor(option)}
					</button>
				))}
			</div>
		</div>
	);
}

function FilterPill({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={`shrink-0 rounded-pill border px-4 py-2 font-medium text-sm transition-colors duration-(--duration-base) ease-out ${
				active
					? "border-accent text-primary"
					: "border-divider text-secondary hover:text-primary"
			}`}
		>
			{children}
		</button>
	);
}

function RestaurantUnavailable() {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-background px-5 text-center text-primary">
			<div>
				<p className="text-caps text-muted">Session ended</p>
				<h1 className="mt-3 text-2xl">Scan the QR code again to continue.</h1>
			</div>
		</main>
	);
}

function NoMatches({
	hasFilters,
	onClear,
}: {
	hasFilters: boolean;
	onClear: () => void;
}) {
	return (
		<section className="mt-12 rounded-xl border border-divider bg-surface p-6 text-center">
			<p className="text-caps text-muted">
				{hasFilters ? "No dishes match your filters" : "No dishes yet"}
			</p>
			{hasFilters ? (
				<button
					type="button"
					onClick={onClear}
					className="mt-3 text-accent text-caps hover:opacity-80"
				>
					Clear filters
				</button>
			) : null}
		</section>
	);
}
