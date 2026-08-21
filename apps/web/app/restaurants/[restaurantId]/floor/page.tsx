"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import { useDismissableOverlay } from "@/components/use-dismissable-overlay";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import type { AppRouter } from "@/server/routers/_app";
import { RestaurantNavHeader } from "../restaurant-nav-header";

type Table = inferRouterOutputs<AppRouter>["tables"]["list"][number];

// Floor (docs/product.md § Shared Table Session): Order on behalf of guest
// and Merge Tables, the two Waiter-reachable table actions Table Matrix
// doesn't offer (that page is Owner/Manager config — QR/create/hide, gated
// by tables/layout.tsx). Only occupied tables get an action here; a free
// table has no session yet for a guest to order into or merge would-be
// tables toward.
export default function FloorPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const [mergeTarget, setMergeTarget] = useState<Table | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);

	const utils = trpc.useUtils();
	const router = useRouter();
	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const listQuery = trpc.tables.list.useQuery({ restaurantId });
	const statusQuery = trpc.station.myStationStatus.useQuery({ restaurantId });
	const [pin, setPin] = useState("");
	const [pinError, setPinError] = useState<string | null>(null);
	const [isVerifyingPin, setIsVerifyingPin] = useState(false);

	useEffect(() => {
		if (statusQuery.data?.deviceRevoked) {
			router.replace("/station/pair");
		}
	}, [statusQuery.data?.deviceRevoked, router]);

	async function handlePinSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsVerifyingPin(true);
		setPinError(null);
		const response = await fetch("/station/pin", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ restaurantId, pin }),
		});
		setIsVerifyingPin(false);
		if (!response.ok) {
			setPinError("PIN not recognized.");
			return;
		}
		setPin("");
		utils.station.myStationStatus.invalidate({ restaurantId });
	}

	async function handleSwitchUser() {
		await fetch("/station/pin", { method: "DELETE" });
		utils.station.myStationStatus.invalidate({ restaurantId });
	}

	const supabase = createClient();
	useBroadcastChannel(supabase, `restaurant:${restaurantId}`, {
		"table_session.change": () =>
			utils.tables.list.invalidate({ restaurantId }),
	});

	const mergeMutation = trpc.tables.merge.useMutation({
		onSuccess: () => {
			setMergeTarget(null);
			utils.tables.list.invalidate({ restaurantId });
			setToast({ message: "Tables merged.", tone: "success" });
		},
		onError: (error) => {
			setToast({ message: error.message, tone: "error" });
		},
	});

	const tables = (listQuery.data ?? []).filter((t) => t.status === "active");
	const occupied = tables
		.filter((t) => t.session_id !== null)
		.sort((a, b) => a.label.localeCompare(b.label));
	const free = tables
		.filter((t) => t.session_id === null)
		.sort((a, b) => a.label.localeCompare(b.label));

	return (
		<div className="min-h-dvh bg-background text-primary">
			{/* A failed status check can't be treated as "not a station" — the
			PIN pad would stay hidden while every mutation kept rejecting, so the
			page has to say so and offer a retry. */}
			{statusQuery.isError ? (
				<div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-glass p-4">
					<div className="w-full max-w-xs rounded-xl border border-divider bg-surface-elevated p-8 text-center">
						<p role="alert" className="text-error text-sm">
							Couldn't check this device's status.
						</p>
						<button
							type="button"
							onClick={() => statusQuery.refetch()}
							className="mt-4 text-accent text-caps hover:opacity-80"
						>
							Retry
						</button>
					</div>
				</div>
			) : null}

			{statusQuery.data?.isStation &&
			!statusQuery.data.deviceRevoked &&
			!statusQuery.data.actingStaffName ? (
				<div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-glass p-4">
					<div className="w-full max-w-xs rounded-xl border border-divider bg-surface-elevated p-8">
						<h2 className="text-center text-lg text-primary">Enter your PIN</h2>
						<form
							onSubmit={handlePinSubmit}
							noValidate
							className="mt-6 space-y-4"
						>
							<input
								type="password"
								inputMode="numeric"
								autoComplete="off"
								maxLength={6}
								placeholder="••••"
								value={pin}
								disabled={isVerifyingPin}
								onChange={(event) =>
									setPin(event.target.value.replace(/\D/g, ""))
								}
								className="w-full rounded-sm border border-divider bg-surface px-3 py-3 text-center text-2xl text-primary tracking-widest"
							/>
							{pinError ? (
								<p role="alert" className="text-center text-error text-sm">
									{pinError}
								</p>
							) : null}
							<button
								type="submit"
								disabled={isVerifyingPin || pin.length < 4}
								className="flex h-12 w-full items-center justify-center rounded-md bg-accent font-medium text-background text-sm disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
							>
								{isVerifyingPin ? "Checking…" : "Unlock"}
							</button>
						</form>
					</div>
				</div>
			) : null}

			<RestaurantNavHeader
				restaurantId={restaurantId}
				restaurantName={restaurantQuery.data?.name ?? ""}
				active="Floor"
			/>

			{statusQuery.data?.actingStaffName ? (
				<div className="flex items-center justify-end gap-3 px-4 pt-4 lg:px-16 xl:px-24">
					<span className="text-secondary text-sm">
						Acting as {statusQuery.data.actingStaffName}
					</span>
					<button
						type="button"
						onClick={handleSwitchUser}
						className="text-accent text-sm hover:opacity-80"
					>
						Switch User
					</button>
				</div>
			) : null}

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<PageHeader
					title="Floor"
					description="Order for a guest or merge a free table into an occupied one."
				/>

				{listQuery.isPending ? (
					<div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{Array.from({ length: 6 }, (_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders never reorder.
								key={i}
								className="skeleton h-32 rounded-xl border border-divider"
							/>
						))}
					</div>
				) : listQuery.isError ? (
					<div className="mt-8 rounded-xl border border-divider bg-surface p-8 text-center">
						<p role="alert" className="text-error text-sm">
							Couldn't load tables: {listQuery.error.message}
						</p>
					</div>
				) : occupied.length === 0 ? (
					<div className="mt-8 rounded-xl border border-divider bg-surface p-16 text-center">
						<p className="text-primary">No occupied tables right now.</p>
					</div>
				) : (
					<div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
						{occupied.map((table) => (
							<div
								key={table.id}
								className="flex flex-col gap-3 rounded-xl border border-divider bg-surface p-4"
							>
								<span className="text-accent-secondary text-caps">
									Occupied
								</span>
								<h3 className="truncate text-lg text-primary">{table.label}</h3>
								<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 border-divider border-t pt-3 text-caps">
									<Link
										href={`/restaurants/${restaurantId}/floor/${table.session_id}`}
										className="text-accent no-underline hover:opacity-80"
									>
										Order for Guest
									</Link>
									{free.length > 0 ? (
										<button
											type="button"
											onClick={() => setMergeTarget(table)}
											className="text-secondary hover:text-primary"
										>
											Merge Table
										</button>
									) : null}
								</div>
							</div>
						))}
					</div>
				)}

				{free.length === 0 ? null : (
					<>
						<h2 className="mt-10 text-caps text-muted">Free tables</h2>
						<div className="mt-4 flex flex-wrap gap-2">
							{free.map((table) => (
								<span
									key={table.id}
									className="rounded-pill border border-divider px-4 py-2 text-secondary text-sm"
								>
									{table.label}
								</span>
							))}
						</div>
					</>
				)}
			</main>

			{mergeTarget ? (
				<MergeDialog
					targetTable={mergeTarget}
					freeTables={free}
					onCancel={() => setMergeTarget(null)}
					onConfirm={(freeTableId) =>
						mergeMutation.mutate({
							tableId: freeTableId,
							// biome-ignore lint/style/noNonNullAssertion: mergeTarget only opens for an occupied table, which always has a session_id.
							sessionId: mergeTarget.session_id!,
						})
					}
					isPending={mergeMutation.isPending}
				/>
			) : null}

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}

function MergeDialog({
	targetTable,
	freeTables,
	onCancel,
	onConfirm,
	isPending,
}: {
	targetTable: Table;
	freeTables: Table[];
	onCancel: () => void;
	onConfirm: (freeTableId: string) => void;
	isPending: boolean;
}) {
	const [selectedId, setSelectedId] = useState(freeTables[0]?.id ?? "");
	const [isVisible, setIsVisible] = useState(false);
	const containerRef = useDismissableOverlay<HTMLDivElement>(true, onCancel);

	useEffect(() => {
		const frame = requestAnimationFrame(() => setIsVisible(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	return (
		<div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-glass p-4">
			<div
				ref={containerRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="merge-table-title"
				className={`w-full max-w-sm rounded-xl border border-divider bg-surface-elevated p-8 shadow-lg transition-[opacity,transform] duration-(--duration-deliberate) ease-out ${
					isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
				}`}
			>
				<h2 id="merge-table-title" className="text-lg text-primary">
					Merge into {targetTable.label}
				</h2>
				<p className="mt-3 text-secondary text-sm">
					Fold a free table into this session's shared cart and bill. This can't
					be undone within the session.
				</p>
				<label className="mt-6 flex flex-col gap-2">
					<span className="text-caps text-muted">Free table</span>
					<select
						value={selectedId}
						onChange={(event) => setSelectedId(event.target.value)}
						className="rounded-sm border border-divider bg-surface px-3 py-2 text-primary text-sm"
					>
						{freeTables.map((table) => (
							<option key={table.id} value={table.id}>
								{table.label}
							</option>
						))}
					</select>
				</label>
				<div className="mt-8 flex justify-end gap-3">
					<button
						type="button"
						onClick={onCancel}
						disabled={isPending}
						className="rounded-sm px-4 py-2 text-secondary text-sm hover:text-primary disabled:cursor-not-allowed"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => onConfirm(selectedId)}
						disabled={isPending || !selectedId}
						className="rounded-md bg-accent px-6 py-2 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
					>
						{isPending ? "Merging…" : "Merge"}
					</button>
				</div>
			</div>
		</div>
	);
}
