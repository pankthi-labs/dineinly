"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { Plus, QrCode, UtensilsCrossed } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import { downloadPdf } from "@/lib/download-pdf";
import { visibleFilters as visiblePills } from "@/lib/filter-pills";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import type { AppRouter } from "@/server/routers/_app";
import { RestaurantNavHeader } from "../restaurant-nav-header";
import type { HideTarget } from "./hide-confirm-dialog";
import { HideConfirmDialog } from "./hide-confirm-dialog";
import { QrModal } from "./qr-modal";
import type { RegenerateTarget } from "./regenerate-confirm-dialog";
import { RegenerateConfirmDialog } from "./regenerate-confirm-dialog";
import { TableCard } from "./table-card";
import type { EditTarget, TableFormValues } from "./table-form-sheet";
import { TableFormSheet } from "./table-form-sheet";

type Table = inferRouterOutputs<AppRouter>["tables"]["list"][number];
type StatusFilter = "all" | "free" | "occupied" | "hidden";

const FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "free", label: "Free" },
	{ value: "occupied", label: "Occupied" },
	{ value: "hidden", label: "Hidden" },
];

// Free-first: the actionable question staff glance at this page for is
// "where can I seat guests right now" — occupied tables need no action,
// hidden ones are out of service and least relevant. Label breaks ties.
function statusRank(table: Table): number {
	if (table.status === "archived") return 2;
	if (table.session_id !== null) return 1;
	return 0;
}

function matchesFilter(table: Table, filter: StatusFilter): boolean {
	switch (filter) {
		case "free":
			return table.status === "active" && table.session_id === null;
		case "occupied":
			return table.status === "active" && table.session_id !== null;
		case "hidden":
			return table.status === "archived";
		default:
			return true;
	}
}

export default function TableMatrixPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [sheetMode, setSheetMode] = useState<"closed" | "create" | "edit">(
		"closed",
	);
	const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
	const [hideTarget, setHideTarget] = useState<HideTarget | null>(null);
	const [regenerateTarget, setRegenerateTarget] =
		useState<RegenerateTarget | null>(null);
	const [qrTargetId, setQrTargetId] = useState<string | null>(null);
	const [downloadingId, setDownloadingId] = useState<string | null>(null);
	const [isDownloadingAll, setIsDownloadingAll] = useState(false);
	const [toast, setToast] = useState<ToastState | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const utils = trpc.useUtils();
	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const listQuery = trpc.tables.list.useQuery({ restaurantId });

	// Staff realtime, same as Kitchen Display: session.change fires on
	// every session open/close so occupied/free status updates live instead
	// of only on this page's own mutations or a manual reload.
	const supabase = createClient();
	useBroadcastChannel(supabase, `restaurant:${restaurantId}`, {
		"session.change": () => utils.tables.list.invalidate({ restaurantId }),
	});

	function invalidateAndNotify(message: string) {
		utils.tables.list.invalidate({ restaurantId });
		setToast({ message, tone: "success" });
	}

	function notifyError(error: { message: string }) {
		setSubmitError(error.message);
	}

	const createMutation = trpc.tables.create.useMutation({
		onSuccess: () => {
			setSheetMode("closed");
			invalidateAndNotify("Table created.");
		},
		onError: notifyError,
	});

	const updateMutation = trpc.tables.update.useMutation({
		onError: notifyError,
	});

	const setStatusMutation = trpc.tables.setStatus.useMutation({
		onSuccess: (data) => {
			setHideTarget(null);
			invalidateAndNotify(
				data.status === "archived" ? "Table hidden." : "Table shown again.",
			);
		},
		onError: (error) => {
			setHideTarget(null);
			setToast({ message: error.message, tone: "error" });
		},
	});

	const regenerateMutation = trpc.tables.regenerateQr.useMutation({
		onSuccess: () => {
			setRegenerateTarget(null);
			invalidateAndNotify("QR code regenerated.");
		},
		onError: (error) => {
			setRegenerateTarget(null);
			setToast({ message: error.message, tone: "error" });
		},
	});

	function openCreateSheet() {
		setSubmitError(null);
		setEditTarget(null);
		setSheetMode("create");
	}

	function openEditSheet(id: string, label: string) {
		setSubmitError(null);
		setEditTarget({ id, values: { label } });
		setSheetMode("edit");
	}

	async function handleUpdateSubmit(id: string, values: TableFormValues) {
		setSubmitError(null);
		try {
			await updateMutation.mutateAsync({ id, ...values });
			setSheetMode("closed");
			invalidateAndNotify("Table updated.");
		} catch {
			// submitError already set by the failing mutation's onError above.
		}
	}

	async function handleDownloadPdf(id: string) {
		setDownloadingId(id);
		try {
			const result = await utils.tables.downloadQrPdf.fetch({
				id,
				origin: window.location.origin,
			});
			downloadPdf(result.fileName, result.base64);
		} catch (error) {
			setToast({
				message:
					error instanceof Error
						? error.message
						: "Unable to download the QR code.",
				tone: "error",
			});
		} finally {
			setDownloadingId(null);
		}
	}

	async function handleDownloadAll() {
		setIsDownloadingAll(true);
		try {
			const result = await utils.tables.downloadAllQrPdf.fetch({
				restaurantId,
				origin: window.location.origin,
			});
			downloadPdf(result.fileName, result.base64);
		} catch (error) {
			setToast({
				message:
					error instanceof Error
						? error.message
						: "Unable to download QR codes.",
				tone: "error",
			});
		} finally {
			setIsDownloadingAll(false);
		}
	}

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	const tables = listQuery.data ?? [];
	const sortedTables = [...tables].sort(
		(a, b) => statusRank(a) - statusRank(b) || a.label.localeCompare(b.label),
	);
	const filterCounts = {
		all: tables.length,
		free: tables.filter((t) => matchesFilter(t, "free")).length,
		occupied: tables.filter((t) => matchesFilter(t, "occupied")).length,
		hidden: tables.filter((t) => matchesFilter(t, "hidden")).length,
	};
	const statusesPresent = (
		["free", "occupied", "hidden"] as StatusFilter[]
	).filter((status) => filterCounts[status] > 0);
	const visibleFilters = visiblePills(FILTERS, statusesPresent);
	const normalizedSearch = search.trim().toLowerCase();
	const visibleTables = sortedTables
		.filter((table) => matchesFilter(table, statusFilter))
		.filter((table) => table.label.toLowerCase().includes(normalizedSearch));
	const qrTarget = tables.find((table) => table.id === qrTargetId) ?? null;

	return (
		<div className="min-h-dvh bg-background text-primary">
			<RestaurantNavHeader
				restaurantId={restaurantId}
				restaurantName={restaurantQuery.data?.name ?? ""}
				active="Table Matrix"
			/>

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<PageHeader
					search={{
						value: search,
						onChange: setSearch,
						label: "Search tables",
					}}
					title="Table Matrix"
					description="Create tables, manage QR codes, and control who can seat where."
					actions={
						<>
							<button
								type="button"
								onClick={handleDownloadAll}
								disabled={
									isDownloadingAll ||
									filterCounts.free + filterCounts.occupied === 0
								}
								className="flex shrink-0 items-center gap-2 rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
							>
								<QrCode
									className="icon-sm"
									strokeWidth={1.5}
									aria-hidden="true"
								/>
								{isDownloadingAll ? "Preparing…" : "Download All QR Codes"}
							</button>
							<button
								type="button"
								onClick={openCreateSheet}
								className="flex shrink-0 items-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover"
							>
								<Plus
									className="icon-sm"
									strokeWidth={1.5}
									aria-hidden="true"
								/>
								Create Table
							</button>
						</>
					}
				/>

				{visibleFilters.length === 0 ? null : (
					<div className="mt-8 flex flex-wrap items-center gap-2">
						{visibleFilters.map((filter) => (
							<button
								key={filter.value}
								type="button"
								onClick={() => setStatusFilter(filter.value)}
								aria-pressed={statusFilter === filter.value}
								className={`rounded-pill border px-4 py-2 font-medium text-sm transition-colors duration-(--duration-base) ease-out ${
									statusFilter === filter.value
										? "border-accent text-primary"
										: "border-divider text-secondary hover:text-primary"
								}`}
							>
								{filter.label} ({filterCounts[filter.value]})
							</button>
						))}
					</div>
				)}

				<div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
					{listQuery.isPending ? (
						Array.from({ length: 8 }, (_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders never reorder.
								key={i}
								className="skeleton h-32 rounded-xl border border-divider"
							/>
						))
					) : listQuery.isError ? (
						<div className="col-span-full rounded-xl border border-divider bg-surface p-8 text-center">
							<p role="alert" className="text-error text-sm">
								Couldn't load tables: {listQuery.error.message}
							</p>
							<button
								type="button"
								onClick={() => listQuery.refetch()}
								className="mt-4 text-accent text-caps hover:opacity-80"
							>
								Retry
							</button>
						</div>
					) : tables.length === 0 ? (
						<div className="col-span-full flex flex-col items-center gap-4 rounded-xl border border-divider bg-surface p-16 text-center">
							<UtensilsCrossed
								className="icon-xl text-muted"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<p className="text-primary">No tables yet.</p>
							<button
								type="button"
								onClick={openCreateSheet}
								className="text-accent text-caps hover:opacity-80"
							>
								Create your first table
							</button>
						</div>
					) : visibleTables.length === 0 ? (
						<div className="col-span-full rounded-xl border border-divider bg-surface p-6">
							<p className="text-caps text-muted">No tables match this view.</p>
							<button
								type="button"
								onClick={() => {
									setSearch("");
									setStatusFilter("all");
								}}
								className="mt-3 text-accent text-caps hover:opacity-80"
							>
								Clear filters
							</button>
						</div>
					) : (
						visibleTables.map((table) => (
							<TableCard
								key={table.id}
								table={table}
								onOpenQr={() => setQrTargetId(table.id)}
								onEdit={() => openEditSheet(table.id, table.label)}
								onRegenerate={() =>
									setRegenerateTarget({ id: table.id, label: table.label })
								}
								onRequestStatusChange={() =>
									setHideTarget({
										id: table.id,
										label: table.label,
										nextStatus:
											table.status === "active" ? "archived" : "active",
									})
								}
							/>
						))
					)}
				</div>

				<SiteFooter variant="compact" className="mt-16 lg:mt-24" />
			</main>

			{sheetMode !== "closed" ? (
				<TableFormSheet
					editTarget={editTarget}
					onClose={() => setSheetMode("closed")}
					onCreate={(values) =>
						createMutation.mutate({ restaurantId, ...values })
					}
					onUpdate={handleUpdateSubmit}
					isSubmitting={isSubmitting}
					submitError={submitError}
				/>
			) : null}

			{hideTarget ? (
				<HideConfirmDialog
					target={hideTarget}
					onCancel={() => setHideTarget(null)}
					onConfirm={() =>
						setStatusMutation.mutate({
							id: hideTarget.id,
							status: hideTarget.nextStatus,
						})
					}
					isPending={setStatusMutation.isPending}
				/>
			) : null}

			{regenerateTarget ? (
				<RegenerateConfirmDialog
					target={regenerateTarget}
					onCancel={() => setRegenerateTarget(null)}
					onConfirm={() =>
						regenerateMutation.mutate({ id: regenerateTarget.id })
					}
					isPending={regenerateMutation.isPending}
				/>
			) : null}

			{qrTarget ? (
				<QrModal
					label={qrTarget.label}
					qrToken={qrTarget.qr_token}
					onClose={() => setQrTargetId(null)}
					onDownloadPdf={() => handleDownloadPdf(qrTarget.id)}
					isDownloading={downloadingId === qrTarget.id}
				/>
			) : null}

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}
