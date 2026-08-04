"use client";

import { Plus, Search, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { AdminHeaderActions } from "../admin-header-actions";
import type { PauseTarget } from "./pause-confirm-dialog";
import { PauseConfirmDialog } from "./pause-confirm-dialog";
import type { EditTarget, RestaurantFormValues } from "./restaurant-form-sheet";
import { RestaurantFormSheet } from "./restaurant-form-sheet";
import { RestaurantRow } from "./restaurant-row";
import type { ToastState } from "./toast";
import { Toast } from "./toast";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

export default function RestaurantsDirectoryPage() {
	const [page, setPage] = useState(1);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const [sheetMode, setSheetMode] = useState<"closed" | "create" | "edit">(
		"closed",
	);
	const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
	const [pauseTarget, setPauseTarget] = useState<PauseTarget | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(1);
		}, SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [searchInput]);

	const utils = trpc.useUtils();
	const listQuery = trpc.restaurants.list.useQuery({
		page,
		pageSize: PAGE_SIZE,
		search: search || undefined,
	});

	function invalidateAndNotify(message: string) {
		utils.restaurants.list.invalidate();
		setToast({ message, tone: "success" });
	}

	function notifyError(error: { message: string }) {
		setSubmitError(error.message);
	}

	const createMutation = trpc.restaurants.create.useMutation({
		onSuccess: () => {
			setSheetMode("closed");
			invalidateAndNotify("Restaurant created.");
		},
		onError: notifyError,
	});

	const updateMutation = trpc.restaurants.update.useMutation({
		onError: notifyError,
	});

	const reassignMutation = trpc.restaurants.reassignPrimaryOwner.useMutation({
		onError: notifyError,
	});

	const setStatusMutation = trpc.restaurants.setStatus.useMutation({
		onSuccess: (data) => {
			setPauseTarget(null);
			invalidateAndNotify(
				data.status === "archived"
					? "Restaurant paused."
					: "Restaurant reactivated.",
			);
		},
		onError: (error) => {
			setPauseTarget(null);
			setToast({ message: error.message, tone: "error" });
		},
	});

	function toggleExpanded(id: string) {
		setExpandedIds((current) => {
			const next = new Set(current);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function openCreateSheet() {
		setSubmitError(null);
		setEditTarget(null);
		setSheetMode("create");
	}

	function openEditSheet(
		item: NonNullable<typeof listQuery.data>["items"][number],
	) {
		setSubmitError(null);
		setEditTarget({
			id: item.id,
			adminStatus: item.admin?.status ?? null,
			values: {
				name: item.name,
				address: item.address,
				city: item.city,
				gstNumber: item.gstNumber,
				state: item.state,
				pincode: item.pincode,
				serviceChargePercent: item.serviceChargePercent,
				adminName: item.admin?.name ?? "",
				adminEmail: item.admin?.email ?? "",
				adminMobile: item.admin?.mobile ?? "",
			},
		});
		setSheetMode("edit");
	}

	async function handleUpdateSubmit(
		id: string,
		values: RestaurantFormValues,
		reassignTo?: { adminName: string; adminEmail: string; adminMobile: string },
	) {
		setSubmitError(null);
		try {
			await updateMutation.mutateAsync({ id, ...values });
			if (reassignTo) {
				await reassignMutation.mutateAsync({ restaurantId: id, ...reassignTo });
			}
			setSheetMode("closed");
			invalidateAndNotify(
				reassignTo ? "Primary admin reassigned." : "Restaurant updated.",
			);
		} catch {
			// submitError already set by the failing mutation's onError above.
		}
	}

	const isSubmitting =
		createMutation.isPending ||
		updateMutation.isPending ||
		reassignMutation.isPending;

	const items = listQuery.data?.items ?? [];
	const total = listQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	return (
		<div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-12 lg:py-16">
			<header className="mb-10 flex flex-col gap-8 sm:mb-16 sm:gap-12">
				<div className="flex items-center justify-between gap-4">
					<Image
						src="/brand/dineinly-logo-dark.svg"
						alt="Dineinly"
						width={140}
						height={45}
						priority
					/>
					<AdminHeaderActions />
				</div>

				<div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<Link
							href="/admin"
							className="text-caps text-secondary no-underline hover:text-primary"
						>
							← Admin
						</Link>
						<h1 className="mt-4 text-2xl text-primary sm:text-3xl lg:text-4xl">
							Restaurants Directory
						</h1>
					</div>

					<div className="flex items-center gap-3">
						{searchOpen ? (
							<div className="relative w-full sm:max-w-xs">
								<Search
									className="icon-sm pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
									strokeWidth={1.5}
									aria-hidden="true"
								/>
								<input
									type="search"
									value={searchInput}
									onChange={(e) => setSearchInput(e.target.value)}
									onBlur={() => {
										if (!searchInput) setSearchOpen(false);
									}}
									placeholder="Search restaurants"
									aria-label="Search restaurants"
									className="h-12 w-full appearance-none rounded-sm border border-divider bg-surface pr-4 pl-12 text-primary text-sm transition-colors duration-(--duration-base) ease-out placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
								/>
							</div>
						) : (
							<button
								type="button"
								onClick={() => setSearchOpen(true)}
								aria-label="Search restaurants"
								className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-divider text-secondary transition-colors duration-(--duration-base) ease-out hover:border-accent/40 hover:text-primary"
							>
								<Search
									className="icon-sm"
									strokeWidth={1.5}
									aria-hidden="true"
								/>
							</button>
						)}
						<button
							type="button"
							onClick={openCreateSheet}
							className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-6 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover"
						>
							<Plus className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
							Create Restaurant
						</button>
					</div>
				</div>
			</header>

			<main className="flex-1 space-y-4">
				{listQuery.isPending ? (
					Array.from({ length: 3 }, (_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders never reorder.
							key={i}
							className="skeleton h-24 rounded-xl border border-divider"
						/>
					))
				) : listQuery.isError ? (
					<div className="rounded-xl border border-divider bg-surface p-8 text-center">
						<p role="alert" className="text-error text-sm">
							Couldn't load restaurants: {listQuery.error.message}
						</p>
						<button
							type="button"
							onClick={() => listQuery.refetch()}
							className="mt-4 text-accent text-caps hover:text-accent-hover"
						>
							Retry
						</button>
					</div>
				) : items.length === 0 ? (
					<div className="flex flex-col items-center gap-4 rounded-xl border border-divider bg-surface p-16 text-center">
						<UtensilsCrossed
							className="icon-xl text-muted"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
						{search ? (
							<>
								<p className="text-primary">No restaurants match "{search}".</p>
								<button
									type="button"
									onClick={() => setSearchInput("")}
									className="text-accent text-caps hover:text-accent-hover"
								>
									Clear search
								</button>
							</>
						) : (
							<>
								<p className="text-primary">No restaurants yet.</p>
								<button
									type="button"
									onClick={openCreateSheet}
									className="text-accent text-caps hover:text-accent-hover"
								>
									Create your first restaurant
								</button>
							</>
						)}
					</div>
				) : (
					items.map((item) => (
						<RestaurantRow
							key={item.id}
							restaurant={item}
							isExpanded={expandedIds.has(item.id)}
							onToggle={() => toggleExpanded(item.id)}
							onEdit={() => openEditSheet(item)}
							onRequestStatusChange={() =>
								setPauseTarget({
									id: item.id,
									name: item.name,
									nextStatus: item.status === "active" ? "archived" : "active",
								})
							}
						/>
					))
				)}
			</main>

			{total > 0 ? (
				<nav
					aria-label="Pagination"
					className="mt-12 flex flex-col items-center justify-between gap-6 border-divider border-t pt-8 lg:flex-row"
				>
					<p className="text-secondary text-sm">
						Showing {(page - 1) * PAGE_SIZE + 1}-
						{Math.min(page * PAGE_SIZE, total)} of {total} restaurants
					</p>
					<div className="flex flex-wrap items-center justify-center gap-2">
						<button
							type="button"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={page === 1}
							className="h-10 w-10 rounded-md border border-divider text-secondary hover:border-accent/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
						>
							‹
						</button>
						{Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => setPage(p)}
								aria-current={p === page ? "page" : undefined}
								className={`h-10 w-10 rounded-md font-medium text-sm ${
									p === page
										? "bg-accent text-background"
										: "border border-divider text-secondary hover:border-accent/40 hover:text-primary"
								}`}
							>
								{p}
							</button>
						))}
						<button
							type="button"
							onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
							disabled={page === totalPages}
							className="h-10 w-10 rounded-md border border-divider text-secondary hover:border-accent/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
						>
							›
						</button>
					</div>
				</nav>
			) : null}

			<footer className="mt-16 border-divider border-t pt-8 lg:mt-24">
				<p className="text-caps text-muted">
					© {new Date().getFullYear()} Dineinly. All rights reserved.
				</p>
			</footer>

			{sheetMode !== "closed" ? (
				<RestaurantFormSheet
					editTarget={editTarget}
					onClose={() => setSheetMode("closed")}
					onCreate={(values) => createMutation.mutate(values)}
					onUpdate={handleUpdateSubmit}
					isSubmitting={isSubmitting}
					submitError={submitError}
				/>
			) : null}

			{pauseTarget ? (
				<PauseConfirmDialog
					target={pauseTarget}
					onCancel={() => setPauseTarget(null)}
					onConfirm={() =>
						setStatusMutation.mutate({
							id: pauseTarget.id,
							status: pauseTarget.nextStatus,
						})
					}
					isPending={setStatusMutation.isPending}
				/>
			) : null}

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}
