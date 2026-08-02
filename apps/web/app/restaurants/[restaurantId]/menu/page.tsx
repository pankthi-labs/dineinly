"use client";

import { ChevronDown } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/lib/trpc-client";

import { AddCategoryPanel } from "./add-category-panel";
import { AddDishPanel } from "./add-dish-panel";
import { EditDishPanel } from "./edit-dish-panel";

type MenuItem = {
	id: string;
	category_id: string;
	name: string;
	description: string;
	price: number;
	diet: "veg" | "non_veg";
	availability: "available" | "sold_out";
	status: "active" | "archived";
	labels: string[];
	prep_time: number;
	serving_size: string;
	spice: "mild" | "regular" | "extra spicy" | null;
	salt: "less salt" | "regular" | null;
	ice: "none" | "less" | "regular" | null;
};

const navigation = [
	"Overview",
	"Menu Desk",
	"Table Matrix",
	"Staff Roster",
	"Venue Settings",
	"Bills",
];

export default function RestaurantMenuPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
	const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
	const [isAddingCategory, setIsAddingCategory] = useState(false);
	const [isAddingDish, setIsAddingDish] = useState(false);
	const menu = trpc.menu.listForManagement.useQuery({ restaurantId });

	if (menu.isPending) {
		return <MenuLoading />;
	}

	if (menu.isError) {
		return <MenuError onRetry={() => menu.refetch()} />;
	}

	if (!menu.data) {
		return <MenuUnavailable />;
	}

	return (
		<div className="min-h-dvh bg-background text-primary">
			<header className="border-divider border-b bg-surface">
				<div className="flex flex-col gap-6 px-4 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-16 xl:px-24">
					<div>
						<p className="text-2xl text-primary">{menu.data.restaurant.name}</p>
						<p className="mt-1 text-muted text-sm">
							Restaurant menu management
						</p>
					</div>
					<nav aria-label="Restaurant navigation" className="overflow-x-auto">
						<ul className="flex min-w-max items-center gap-6 text-sm lg:gap-8">
							{navigation.map((item) => (
								<li key={item}>
									<span
										aria-current={item === "Menu Desk" ? "page" : undefined}
										className={
											item === "Menu Desk"
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
				</div>
			</header>

			<main className="px-4 py-10 lg:px-16 lg:py-16 xl:px-24">
				<div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p className="text-caps text-muted">Admin workspace</p>
						<h1 className="mt-3 text-3xl text-primary lg:text-4xl">
							Menu Desk
						</h1>
						<p className="prose mt-3 text-base text-secondary">
							Review menu availability and item details for{" "}
							{menu.data.restaurant.name}.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<button
							type="button"
							onClick={() => setIsAddingCategory(true)}
							className="rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated hover:text-primary"
						>
							Add category
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
							className="rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
						>
							Add dish
						</button>
					</div>
				</div>

				{menu.data.categories.length === 0 ? (
					<EmptyMenu />
				) : (
					<div className="mt-16 flex flex-col gap-12">
						{menu.data.categories.map((category) => (
							<section
								key={category.id}
								aria-labelledby={`category-${category.id}`}
							>
								<div className="flex items-center gap-4">
									<h2
										id={`category-${category.id}`}
										className="shrink-0 text-caps text-muted"
									>
										{category.name}
										{category.status === "archived" ? " · Hidden" : ""}
									</h2>
									<div aria-hidden="true" className="h-px w-full bg-divider" />
								</div>
								{category.items.length === 0 ? (
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
						))}
					</div>
				)}
			</main>
			{isAddingCategory ? (
				<AddCategoryPanel
					restaurantId={restaurantId}
					onClose={() => setIsAddingCategory(false)}
				/>
			) : null}
			{editingItem ? (
				<EditDishPanel
					restaurantId={restaurantId}
					item={editingItem}
					categories={menu.data.categories}
					onClose={() => setEditingItem(null)}
				/>
			) : null}
			{isAddingDish ? (
				<AddDishPanel
					restaurantId={restaurantId}
					categories={menu.data.categories}
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
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const utils = trpc.useUtils();
	const updateItemState = trpc.menu.updateItemState.useMutation({
		onSuccess: async () => {
			await utils.menu.listForManagement.invalidate({ restaurantId });
			setIsConfirmingDelete(false);
		},
	});

	function updateState(
		action: "hide" | "show" | "mark_sold_out" | "mark_available" | "delete",
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
		<article
			className={`overflow-hidden rounded-xl border border-divider bg-surface transition-colors duration-(--duration-base) ease-out ${item.status === "archived" || item.availability === "sold_out" ? "opacity-60" : ""}`}
		>
			<button
				type="button"
				aria-expanded={isExpanded}
				onClick={onToggle}
				className="flex w-full items-start justify-between gap-4 p-5 text-left transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated lg:p-6"
			>
				<div className="min-w-0">
					<p className={`text-caps ${stateColor}`}>{stateLabel}</p>
					<div className="mt-3 flex flex-wrap items-center gap-3">
						<DietMark diet={item.diet} />
						<h3 className="text-primary text-xl">{item.name}</h3>
						{item.labels.map((label) => (
							<span key={label} className="text-accent-secondary text-caps">
								{label}
							</span>
						))}
					</div>
					<p className="prose mt-2 text-muted text-sm">{item.description}</p>
				</div>
				<div className="flex shrink-0 items-center gap-2 text-accent">
					<span className="text-xl">{formatPrice(item.price)}</span>
					<ChevronDown
						aria-hidden="true"
						className={`icon-sm transition-transform duration-(--duration-base) ease-out ${isExpanded ? "rotate-180" : ""}`}
						strokeWidth={1.5}
					/>
				</div>
			</button>
			{isExpanded ? (
				<div className="border-divider border-t bg-background">
					<div className="grid gap-6 p-5 lg:grid-cols-3 lg:p-6">
						<Detail label="Preparation time" value={`${item.prep_time} mins`} />
						<Detail label="Serving size" value={item.serving_size} />
						<div>
							<p className="text-caps text-muted">Guest preferences</p>
							<div className="mt-3 flex flex-wrap gap-3 text-secondary text-sm">
								<Preference label="Spice" value={item.spice} />
								<Preference label="Salt" value={item.salt} />
								<Preference label="Ice" value={item.ice} />
							</div>
						</div>
					</div>
					<div className="flex flex-wrap gap-4 border-divider border-t p-5 lg:p-6">
						<button
							type="button"
							onClick={onEdit}
							className="font-medium text-accent text-sm"
						>
							Edit dish
						</button>
						<button
							type="button"
							onClick={() =>
								updateState(item.status === "archived" ? "show" : "hide")
							}
							disabled={updateItemState.isPending}
							className="font-medium text-accent text-sm disabled:cursor-not-allowed disabled:opacity-60"
						>
							{item.status === "archived" ? "Show dish" : "Hide dish"}
						</button>
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
							className="font-medium text-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
						>
							{item.availability === "sold_out"
								? "Mark available"
								: "Mark sold out"}
						</button>
						{item.status === "active" ? (
							isConfirmingDelete ? (
								<div className="flex flex-wrap items-center gap-3 text-sm">
									<p className="text-secondary">
										Delete this dish? It will be removed from the guest menu.
									</p>
									<button
										type="button"
										onClick={() => setIsConfirmingDelete(false)}
										disabled={updateItemState.isPending}
										className="font-medium text-primary disabled:cursor-not-allowed disabled:opacity-60"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={() => updateState("delete")}
										disabled={updateItemState.isPending}
										className="font-medium text-accent-secondary disabled:cursor-not-allowed disabled:opacity-60"
									>
										Confirm delete
									</button>
								</div>
							) : (
								<button
									type="button"
									onClick={() => setIsConfirmingDelete(true)}
									disabled={updateItemState.isPending}
									className="font-medium text-accent-secondary text-sm disabled:cursor-not-allowed disabled:opacity-60"
								>
									Delete dish
								</button>
							)
						) : null}
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
		<section className="mt-16 rounded-xl border border-divider bg-surface p-6">
			<p className="text-caps text-muted">No categories yet</p>
			<p className="prose mt-3 text-secondary">
				Create a category, then add the restaurant’s first dish.
			</p>
		</section>
	);
}
function Preference({ label, value }: { label: string; value: string | null }) {
	return (
		<span>
			{label}{" "}
			<span className={value ? "text-success" : "text-muted"}>
				{value ?? "Not offered"}
			</span>
		</span>
	);
}
function DietMark({ diet }: { diet: MenuItem["diet"] }) {
	const label = diet === "veg" ? "Vegetarian" : "Non-vegetarian";
	return (
		<span
			role="img"
			aria-label={label}
			className={`flex size-4 items-center justify-center rounded-xs border ${diet === "veg" ? "border-success" : "border-error"}`}
		>
			<span
				aria-hidden="true"
				className={`size-1 rounded-full ${diet === "veg" ? "bg-success" : "bg-error"}`}
			/>
		</span>
	);
}
function Detail({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-caps text-muted">{label}</p>
			<p className="mt-3 text-primary text-sm">{value}</p>
		</div>
	);
}
function formatPrice(price: number) {
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		maximumFractionDigits: 0,
	}).format(price);
}
