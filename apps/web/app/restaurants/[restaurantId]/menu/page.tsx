"use client";

import {
	Check,
	ChevronDown,
	ChevronUp,
	FolderPlus,
	GripVertical,
	Plus,
	Tag,
	X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Detail } from "@/components/detail";
import { DietMark } from "@/components/diet-mark";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import { capitalizeFirst, formatPrice, titleCase } from "@/lib/format";
import { formatScheduleLabel } from "@/lib/menu-item-schedule";
import {
	type PREP_TIME_OPTIONS,
	SERVING_SIZE_LABELS,
	type SERVING_SIZE_OPTIONS,
} from "@/lib/menu-options";
import { moveId, moveIdTo } from "@/lib/reorder";
import { trpc } from "@/lib/trpc-client";
import {
	isOrderingEnabled,
	needsBillingDetails,
} from "@/server/routers/restaurants.schema";
import { RestaurantNavHeader } from "../restaurant-nav-header";
import { AddCategoryPanel } from "./add-category-panel";
import { AddDishPanel } from "./add-dish-panel";
import { AddLabelPanel } from "./add-label-panel";
import { EditDishPanel } from "./edit-dish-panel";

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
	status: "active" | "archived";
	labels: string[];
	prep_time: (typeof PREP_TIME_OPTIONS)[number];
	serving_size: (typeof SERVING_SIZE_OPTIONS)[number];
	offers_spice: boolean;
	offers_salt: boolean;
	offers_ice: boolean;
};

export default function RestaurantMenuPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
	const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(
		new Set(),
	);
	const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
	const [search, setSearch] = useState("");
	const [isAddingCategory, setIsAddingCategory] = useState(false);
	const [isAddingLabel, setIsAddingLabel] = useState(false);
	const [isAddingDish, setIsAddingDish] = useState(false);
	const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(
		null,
	);
	const menu = trpc.menu.listForManagement.useQuery({ restaurantId });
	const utils = trpc.useUtils();
	const reorderCategories = trpc.menu.reorderCategories.useMutation({
		onMutate: async (input) => {
			await utils.menu.listForManagement.cancel({ restaurantId });
			const previous = utils.menu.listForManagement.getData({
				restaurantId,
			});
			utils.menu.listForManagement.setData({ restaurantId }, (current) => {
				if (!current) return current;
				const byId = new Map(current.categories.map((c) => [c.id, c]));
				return {
					...current,
					categories: input.categoryIds.map((id) => {
						const category = byId.get(id);
						if (!category) {
							throw new Error("Reordered a category that is no longer loaded.");
						}
						return category;
					}),
				};
			});
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				utils.menu.listForManagement.setData(
					{ restaurantId },
					context.previous,
				);
			}
		},
		onSettled: () => {
			utils.menu.listForManagement.invalidate({ restaurantId });
		},
	});

	function reorderTo(categoryIds: string[]) {
		reorderCategories.mutate({ restaurantId, categoryIds });
	}

	function moveCategory(categoryId: string, direction: "up" | "down") {
		if (!menu.data) return;
		const ids = menu.data.categories.map((category) => category.id);
		reorderTo(moveId(ids, categoryId, direction));
	}

	function moveCategoryOnDrop(categoryId: string, targetId: string) {
		if (!menu.data) return;
		const ids = menu.data.categories.map((category) => category.id);
		reorderTo(moveIdTo(ids, categoryId, targetId));
	}

	if (menu.isPending) {
		return <MenuLoading />;
	}

	if (menu.isError) {
		return <MenuError onRetry={() => menu.refetch()} />;
	}

	if (!menu.data) {
		return <MenuUnavailable />;
	}

	const categories = menu.data.categories;
	const normalizedSearch = search.trim().toLowerCase();
	// Category order is the stored `sort`; a filtered list isn't that order, so
	// reordering stays disabled while a search is active.
	const isSearching = normalizedSearch.length > 0;
	const visibleCategories = isSearching
		? categories
				.map((category) => ({
					...category,
					items: category.items.filter((item) =>
						item.name.toLowerCase().includes(normalizedSearch),
					),
				}))
				.filter((category) => category.items.length > 0)
		: categories;

	return (
		<div className="min-h-dvh bg-background text-primary">
			<RestaurantNavHeader
				restaurantId={restaurantId}
				restaurantName={menu.data.restaurant.name}
				active="Menu Desk"
			/>

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<PageHeader
					search={{
						value: search,
						onChange: setSearch,
						label: "Search dishes",
					}}
					title="Menu Desk"
					description={
						<>
							Review menu availability and item details for{" "}
							{titleCase(menu.data.restaurant.name)}.
						</>
					}
					actions={
						<>
							<button
								type="button"
								onClick={() => setIsAddingCategory(true)}
								className="flex shrink-0 items-center gap-2 rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated hover:text-primary"
							>
								<FolderPlus
									className="icon-sm"
									strokeWidth={1.5}
									aria-hidden="true"
								/>
								Add category
							</button>
							<button
								type="button"
								onClick={() => setIsAddingLabel(true)}
								className="flex shrink-0 items-center gap-2 rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated hover:text-primary"
							>
								<Tag className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
								Add label
							</button>
							<button
								type="button"
								onClick={() => setIsAddingDish(true)}
								disabled={menu.data.categories.length === 0}
								title={
									menu.data.categories.length === 0
										? "Create a category before adding a dish."
										: undefined
								}
								className="flex shrink-0 items-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
							>
								<Plus
									className="icon-sm"
									strokeWidth={1.5}
									aria-hidden="true"
								/>
								Add dish
							</button>
						</>
					}
				/>

				{categories.length === 0 ? (
					<EmptyMenu />
				) : visibleCategories.length === 0 ? (
					<NoSearchMatches search={search} onClear={() => setSearch("")} />
				) : (
					<div className="mt-12 flex flex-col gap-12">
						{visibleCategories.map((category, index) => {
							const isCollapsed = collapsedCategoryIds.has(category.id);
							return (
								<section
									key={category.id}
									aria-labelledby={`category-${category.id}`}
									onDragOver={(event) => {
										if (draggedCategoryId) event.preventDefault();
									}}
									onDrop={(event) => {
										event.preventDefault();
										if (draggedCategoryId) {
											moveCategoryOnDrop(draggedCategoryId, category.id);
											setDraggedCategoryId(null);
										}
									}}
									className={
										draggedCategoryId === category.id ? "opacity-50" : ""
									}
								>
									<div className="flex w-full items-center gap-4">
										<div className="flex shrink-0 items-center gap-1">
											<button
												type="button"
												draggable={!isSearching}
												disabled={isSearching}
												tabIndex={-1}
												aria-label={`Drag to reorder ${titleCase(category.name)}`}
												onDragStart={() => setDraggedCategoryId(category.id)}
												onDragEnd={() => setDraggedCategoryId(null)}
												className="icon-tap-target flex cursor-grab items-center justify-center text-muted transition-colors duration-(--duration-base) ease-out hover:text-secondary active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
											>
												<GripVertical
													className="icon-sm"
													strokeWidth={1.5}
													aria-hidden="true"
												/>
											</button>
											<div className="flex flex-col">
												<button
													type="button"
													aria-label={`Move ${titleCase(category.name)} up`}
													disabled={
														isSearching ||
														index === 0 ||
														reorderCategories.isPending
													}
													onClick={() => moveCategory(category.id, "up")}
													className="icon-tap-target flex items-center justify-center text-muted transition-colors duration-(--duration-base) ease-out hover:text-secondary disabled:cursor-not-allowed disabled:opacity-30"
												>
													<ChevronUp
														className="icon-xs"
														strokeWidth={1.5}
														aria-hidden="true"
													/>
												</button>
												<button
													type="button"
													aria-label={`Move ${titleCase(category.name)} down`}
													disabled={
														isSearching ||
														index === visibleCategories.length - 1 ||
														reorderCategories.isPending
													}
													onClick={() => moveCategory(category.id, "down")}
													className="icon-tap-target flex items-center justify-center text-muted transition-colors duration-(--duration-base) ease-out hover:text-secondary disabled:cursor-not-allowed disabled:opacity-30"
												>
													<ChevronDown
														className="icon-xs"
														strokeWidth={1.5}
														aria-hidden="true"
													/>
												</button>
											</div>
										</div>
										<button
											type="button"
											aria-expanded={!isCollapsed}
											onClick={() =>
												setCollapsedCategoryIds((current) => {
													const next = new Set(current);
													if (next.has(category.id)) {
														next.delete(category.id);
													} else {
														next.add(category.id);
													}
													return next;
												})
											}
											className="flex flex-1 items-center gap-4 text-left"
										>
											<h2
												id={`category-${category.id}`}
												className="min-w-0 truncate text-caps text-muted"
											>
												{titleCase(category.name)}
												{category.status === "archived" ? " · Hidden" : ""}
											</h2>
											<div
												aria-hidden="true"
												className="h-px flex-1 bg-divider"
											/>
											<ChevronDown
												aria-hidden="true"
												className={`icon-sm shrink-0 text-muted transition-transform duration-(--duration-base) ease-out ${isCollapsed ? "" : "rotate-180"}`}
												strokeWidth={1.5}
											/>
										</button>
									</div>
									{isCollapsed ? null : category.items.length === 0 ? (
										<p className="prose mt-6 text-muted text-sm">
											No dishes in this category.
										</p>
									) : (
										<div className="mt-6 flex flex-col gap-4">
											{category.items.map((item) => (
												<MenuItemCard
													key={item.id}
													item={item}
													restaurantId={restaurantId}
													isExpanded={expandedItemId === item.id}
													onEdit={() => setEditingItem(item)}
													onToggle={() =>
														setExpandedItemId((current) =>
															current === item.id ? null : item.id,
														)
													}
												/>
											))}
										</div>
									)}
								</section>
							);
						})}
					</div>
				)}

				<SiteFooter variant="compact" className="mt-16 lg:mt-24" />
			</main>

			{isAddingCategory ? (
				<AddCategoryPanel
					restaurantId={restaurantId}
					showTaxField={needsBillingDetails(menu.data.restaurant.experience)}
					onClose={() => setIsAddingCategory(false)}
				/>
			) : null}
			{isAddingLabel ? (
				<AddLabelPanel
					restaurantId={restaurantId}
					onClose={() => setIsAddingLabel(false)}
				/>
			) : null}
			{editingItem ? (
				<EditDishPanel
					restaurantId={restaurantId}
					item={editingItem}
					categories={menu.data.categories}
					labels={menu.data.labels}
					showPreferenceFields={isOrderingEnabled(
						menu.data.restaurant.experience,
					)}
					onClose={() => setEditingItem(null)}
				/>
			) : null}
			{isAddingDish ? (
				<AddDishPanel
					restaurantId={restaurantId}
					categories={menu.data.categories}
					labels={menu.data.labels}
					showPreferenceFields={isOrderingEnabled(
						menu.data.restaurant.experience,
					)}
					onClose={() => setIsAddingDish(false)}
				/>
			) : null}
		</div>
	);
}

function MenuItemCard({
	item,
	restaurantId,
	isExpanded,
	onToggle,
	onEdit,
}: {
	item: MenuItem;
	restaurantId: string;
	isExpanded: boolean;
	onToggle: () => void;
	onEdit: () => void;
}) {
	const utils = trpc.useUtils();
	const updateItemState = trpc.menu.updateItemState.useMutation({
		onSuccess: async () => {
			await utils.menu.listForManagement.invalidate({ restaurantId });
		},
	});

	function updateState(
		action: "hide" | "show" | "mark_sold_out" | "mark_available",
	) {
		updateItemState.mutate({ restaurantId, itemId: item.id, action });
	}

	const stateLabel =
		item.status === "archived"
			? "Hidden"
			: item.availability === "sold_out"
				? "Sold out"
				: "Live";
	const stateColor =
		item.status === "active" && item.availability === "available"
			? "text-success"
			: item.availability === "sold_out"
				? "text-accent-secondary"
				: "text-muted";

	return (
		<article className="overflow-hidden rounded-xl border border-divider bg-surface transition-colors duration-(--duration-base) ease-out">
			<button
				type="button"
				aria-expanded={isExpanded}
				onClick={onToggle}
				className={`flex w-full items-start justify-between gap-4 p-5 text-left transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated lg:p-6 ${item.status === "archived" || item.availability === "sold_out" ? "opacity-60" : ""}`}
			>
				<div className="min-w-0">
					<p className={`text-caps ${stateColor}`}>{stateLabel}</p>
					<div className="mt-3 flex flex-wrap items-center gap-3">
						<DietMark diet={item.diet} />
						<h3 className="text-primary text-xl">{titleCase(item.name)}</h3>
						{item.labels.map((label) => (
							<span key={label} className="text-accent-secondary text-caps">
								{titleCase(label)}
							</span>
						))}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<span className="text-2xl text-accent">
						{formatPrice(item.price)}
					</span>
					<ChevronDown
						aria-hidden="true"
						className={`icon-sm text-muted transition-transform duration-(--duration-base) ease-out ${isExpanded ? "rotate-180" : ""}`}
						strokeWidth={1.5}
					/>
				</div>
			</button>
			{isExpanded ? (
				<div className="border-divider border-t bg-background">
					<div className="p-5 lg:p-6">
						<div className="grid gap-6 sm:grid-cols-2">
							<Detail
								label="Description"
								value={
									item.description
										? capitalizeFirst(item.description)
										: "No description"
								}
							/>
							<Detail
								label="Scheduled availability"
								value={formatScheduleLabel(item) ?? "All day, every day"}
							/>
						</div>
						<div className="mt-6 grid gap-6 lg:grid-cols-3">
							<Detail
								label="Preparation time"
								value={titleCase(item.prep_time)}
							/>
							<Detail
								label="Serving size"
								value={SERVING_SIZE_LABELS[item.serving_size]}
							/>
							<div>
								<p className="text-caps text-muted">Guest preferences</p>
								<div className="mt-3 flex flex-wrap gap-3 text-secondary text-sm">
									<Preference label="Spice" offered={item.offers_spice} />
									<Preference label="Salt" offered={item.offers_salt} />
									<Preference label="Ice" offered={item.offers_ice} />
								</div>
							</div>
						</div>
					</div>
					<div className="flex flex-wrap gap-4 border-divider border-t p-5 text-caps lg:p-6">
						<button
							type="button"
							onClick={onEdit}
							className="text-secondary hover:text-primary"
						>
							Edit dish
						</button>
						<button
							type="button"
							onClick={() =>
								updateState(item.status === "archived" ? "show" : "hide")
							}
							disabled={updateItemState.isPending}
							className="text-accent-secondary hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{item.status === "archived" ? "Show dish" : "Hide dish"}
						</button>
						{item.status === "archived" ? null : (
							<button
								type="button"
								onClick={() =>
									updateState(
										item.availability === "sold_out"
											? "mark_available"
											: "mark_sold_out",
									)
								}
								disabled={updateItemState.isPending}
								className="text-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
							>
								{item.availability === "sold_out"
									? "Mark available"
									: "Mark sold out"}
							</button>
						)}
					</div>
					{updateItemState.error ? (
						<p
							role="alert"
							className="border-divider border-t px-5 py-3 text-error text-sm lg:px-6"
						>
							{updateItemState.error.message}
						</p>
					) : null}
				</div>
			) : null}
		</article>
	);
}

function MenuLoading() {
	return (
		<main className="flex min-h-dvh items-center bg-background px-4 text-primary lg:px-16 xl:px-24">
			<p className="text-muted">Loading restaurant menu…</p>
		</main>
	);
}
function MenuError({ onRetry }: { onRetry: () => void }) {
	return (
		<main className="flex min-h-dvh items-center bg-background px-4 text-primary lg:px-16 xl:px-24">
			<div className="rounded-xl border border-divider bg-surface p-6">
				<p className="text-caps text-muted">Menu unavailable</p>
				<h1 className="mt-3 text-3xl">We couldn’t load this menu.</h1>
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
function MenuUnavailable() {
	return (
		<main className="flex min-h-dvh items-center bg-background px-4 text-primary lg:px-16 xl:px-24">
			<div className="rounded-xl border border-divider bg-surface p-6">
				<p className="text-caps text-muted">Restaurant not found</p>
				<h1 className="mt-3 text-3xl">
					No menu is available for this restaurant.
				</h1>
			</div>
		</main>
	);
}
function EmptyMenu() {
	return (
		<section className="mt-12 rounded-xl border border-divider bg-surface p-6">
			<p className="text-caps text-muted">No categories yet</p>
			<p className="prose mt-3 text-secondary">
				Create a category, then add the restaurant’s first dish.
			</p>
		</section>
	);
}
function NoSearchMatches({
	search,
	onClear,
}: {
	search: string;
	onClear: () => void;
}) {
	return (
		<section className="mt-12 rounded-xl border border-divider bg-surface p-6">
			<p className="text-caps text-muted">No dishes match "{search}"</p>
			<button
				type="button"
				onClick={onClear}
				className="mt-3 text-accent text-caps hover:opacity-80"
			>
				Clear search
			</button>
		</section>
	);
}
function Preference({ label, offered }: { label: string; offered: boolean }) {
	const Icon = offered ? Check : X;
	return (
		<span className="inline-flex items-center gap-2">
			<Icon
				aria-hidden="true"
				strokeWidth={1.5}
				className={`icon-sm ${offered ? "text-success" : "text-muted"}`}
			/>
			<span className={offered ? "text-primary" : "text-muted"}>{label}</span>
		</span>
	);
}
