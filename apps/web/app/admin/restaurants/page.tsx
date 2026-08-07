"use client";

import { Plus, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { CollapsibleSearch } from "@/components/collapsible-search";
import { PageHeader } from "@/components/page-header";
import { getPageRange } from "@/lib/pagination";
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
			ownerStatus: item.owner?.status ?? null,
			values: {
				name: item.name,
				address: item.address,
				city: item.city,
				gstNumber: item.gstNumber,
				state: item.state,
				pincode: item.pincode,
				serviceChargePercent: item.serviceChargePercent,
				ownerName: item.owner?.name ?? "",
				ownerEmail: item.owner?.email ?? "",
				ownerMobile: item.owner?.mobile ?? "",
			},
		});
		setSheetMode("edit");
	}

	async function handleUpdateSubmit(id: string, values: RestaurantFormValues) {
		setSubmitError(null);
		try {
			await updateMutation.mutateAsync({ id, ...values });
			setSheetMode("closed");
			invalidateAndNotify("Restaurant updated.");
		} catch {
			// submitError already set by the failing mutation's onError above.
		}
	}

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	const items = listQuery.data?.items ?? [];
	const total = listQuery.data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	return (
		<div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-12 lg:py-16">
			<div className="mb-10 flex items-center justify-between gap-4 sm:mb-16">
				<BrandLogo height={31} priority />
				<AdminHeaderActions />
			</div>

			<div className="mb-10 sm:mb-16">
				<PageHeader
					breadcrumb={
						<Link
							href="/admin"
							className="text-caps text-secondary no-underline hover:text-primary"
						>
							← Admin
						</Link>
					}
					search={
						<CollapsibleSearch
							value={searchInput}
							onChange={setSearchInput}
							label="Search restaurants"
						/>
					}
					title="Restaurants Directory"
					actions={
						<button
							type="button"
							onClick={openCreateSheet}
							className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-6 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover"
						>
							<Plus className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
							Create Restaurant
						</button>
					}
				/>
			</div>

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
						{getPageRange(page, totalPages).map((entry, index) =>
							entry === "ellipsis" ? (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: ellipsis markers never reorder within a static range.
									key={`ellipsis-${index}`}
									aria-hidden="true"
									className="flex h-10 w-10 items-center justify-center text-muted"
								>
									…
								</span>
							) : (
								<button
									key={entry}
									type="button"
									onClick={() => setPage(entry)}
									aria-current={entry === page ? "page" : undefined}
									className={`h-10 w-10 rounded-md font-medium text-sm ${
										entry === page
											? "bg-accent text-background"
											: "border border-divider text-secondary hover:border-accent/40 hover:text-primary"
									}`}
								>
									{entry}
								</button>
							),
						)}
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
