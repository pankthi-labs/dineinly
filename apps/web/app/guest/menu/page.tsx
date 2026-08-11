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
import { formatPrice, titleCase } from "@/lib/format";
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
	description: string;
	price: number;
	diet: "veg" | "non_veg";
	availability: "available" | "sold_out";
	labels: string[];
	prep_time: (typeof PREP_TIME_OPTIONS)[number];
	serving_size: (typeof SERVING_SIZE_OPTIONS)[number];
	offers_spice: boolean;
	offers_salt: boolean;
	offers_ice: boolean;
};

const FASTEST_PREP_TIME: (typeof PREP_TIME_OPTIONS)[number] = "5-10 mins";

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
	// Shared cart — another guest at the table can add/edit lines this device
	// never mutated, so this relies on the session:{id} broadcast below
	// rather than only its own mutations to stay current.
	const cart = trpc.guest.cart.list.useQuery(undefined, {
		enabled: menu.isSuccess,
	});
	const addItem = trpc.guest.cart.addItem.useMutation({
		onSuccess: () => utils.guest.cart.list.invalidate(),
	});
	const setQuantity = trpc.guest.cart.setQuantity.useMutation({
		onSuccess: () => utils.guest.cart.list.invalidate(),
	});
	const orders = trpc.guest.orders.list.useQuery(undefined, {
		enabled: menu.isSuccess,
	});
	const hasOrders = (orders.data?.length ?? 0) > 0;

	const { client, restaurantId, tableSessionId } = useGuestRealtime();
	useBroadcastChannel(
		client,
		tableSessionId ? `session:${tableSessionId}` : null,
		{ "cart_item.change": () => utils.guest.cart.list.invalidate() },
	);
	useBroadcastChannel(client, restaurantId ? `menu:${restaurantId}` : null, {
		"menu_item.availability": () => utils.guest.menu.invalidate(),
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
				items: category.items.filter((item) => {
					if (query && !item.name.toLowerCase().includes(query)) return false;
					if (activeDiets.length > 0 && !activeDiets.includes(item.diet))
						return false;
					if (expressOnly && item.prep_time !== FASTEST_PREP_TIME) return false;
					if (sharingOnly && item.serving_size === "serves 1") return false;
					return true;
				}),
			}))
			.filter((category) => category.items.length > 0);
	}, [menu.data, search, activeDiets, expressOnly, sharingOnly]);

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

	function jumpToCategory(categoryId: string) {
		setActiveCategoryId(categoryId);
		document
			.getElementById(`category-${categoryId}`)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
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
								<h1 className="text-2xl">{menu.data.restaurant.name}</h1>
								<PoweredByDineinly className="mt-1" />
							</div>
							<p className="shrink-0 rounded-pill border border-divider px-3 py-1 text-caps text-secondary">
								Table {menu.data.tableLabel}
							</p>
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

				<div className="no-scrollbar flex flex-nowrap gap-3 overflow-x-auto px-5 pb-4">
					<FilterPill
						active={activeDiets.includes("veg")}
						onClick={() => toggleDiet("veg")}
					>
						Veg
					</FilterPill>
					<FilterPill
						active={activeDiets.includes("non_veg")}
						onClick={() => toggleDiet("non_veg")}
					>
						Non-Veg
					</FilterPill>
					<FilterPill
						active={expressOnly}
						onClick={() => setExpressOnly((value) => !value)}
					>
						Quick Serve
					</FilterPill>
					<FilterPill
						active={sharingOnly}
						onClick={() => setSharingOnly((value) => !value)}
					>
						Made to Share
					</FilterPill>
				</div>
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
							<h2 className="font-semibold text-primary text-sm">
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
									return (
										<MenuItemCard
											key={item.id}
											item={item}
											onOpen={() => setOpenItem(item)}
											cartQuantity={cartQuantity}
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
			</main>

			{openItem ? (
				<MenuItemDrawer
					key={openItem.id}
					item={openItem}
					onClose={() => setOpenItem(null)}
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
								onClick={() => router.push("/guest/orders")}
								className="font-semibold text-accent text-sm"
							>
								My Orders
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
	onOpen,
	cartQuantity,
	onAdd,
	onDecrement,
}: {
	item: MenuItem;
	onOpen: () => void;
	cartQuantity: number;
	onAdd: () => void;
	onDecrement: () => void;
}) {
	const soldOut = item.availability === "sold_out";
	const kicker = item.labels[0] ? labelKicker(item.labels[0]) : null;
	return (
		<div
			className={`rounded-xl border border-divider bg-surface p-5 ${soldOut ? "opacity-60" : ""}`}
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
					<h3 className="min-w-0 text-lg text-primary">
						<span className="mr-2 inline-block align-middle">
							<DietMark diet={item.diet} />
						</span>
						{titleCase(item.name)}
					</h3>
					<p className="prose text-secondary text-sm">{item.description}</p>
				</button>
				<span className="self-start justify-self-end whitespace-nowrap text-lg text-primary">
					{formatPrice(item.price)}
				</span>
				{soldOut ? (
					<span className="self-start justify-self-end text-caps text-muted">
						Sold out
					</span>
				) : (
					// One control for both states — at quantity 0 it renders
					// "Add" itself, so tapping it can never resize the row.
					<div className="self-start justify-self-end">
						<QuantityPill
							value={cartQuantity}
							onDecrement={onDecrement}
							onIncrement={onAdd}
						/>
					</div>
				)}
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
	onAddToOrder,
}: {
	item: MenuItem;
	onClose: () => void;
	onAddToOrder: (input: {
		quantity: number;
		spice?: (typeof SPICE_OPTIONS)[number];
		salt?: (typeof SALT_OPTIONS)[number];
		ice?: (typeof ICE_OPTIONS)[number];
	}) => Promise<unknown>;
}) {
	const soldOut = item.availability === "sold_out";
	const kicker = item.labels[0] ? labelKicker(item.labels[0]) : null;
	const [quantity, setQuantity] = useState(1);
	const [spice, setSpice] = useState<(typeof SPICE_OPTIONS)[number]>("regular");
	const [salt, setSalt] = useState<(typeof SALT_OPTIONS)[number]>("regular");
	const [ice, setIce] = useState<(typeof ICE_OPTIONS)[number]>("regular");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const hasPreferences =
		item.offers_spice || item.offers_salt || item.offers_ice;

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
				soldOut ? (
					<p className="text-center text-caps text-muted">
						Currently unavailable
					</p>
				) : (
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
								className="flex-1 rounded-md bg-accent px-6 py-4 font-medium text-background text-sm disabled:cursor-not-allowed disabled:opacity-60"
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
						<h2 className="text-3xl text-primary">{titleCase(item.name)}</h2>
						<span className="shrink-0 text-2xl text-accent">
							{formatPrice(item.price)}
						</span>
					</div>
				</div>

				<p className="prose text-base text-secondary">{item.description}</p>

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
				<p className="text-caps text-muted">Menu unavailable</p>
				<h1 className="mt-3 text-2xl">
					This restaurant's menu isn't available right now.
				</h1>
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
					className="mt-3 text-accent text-caps hover:text-accent-hover"
				>
					Clear filters
				</button>
			) : null}
		</section>
	);
}
