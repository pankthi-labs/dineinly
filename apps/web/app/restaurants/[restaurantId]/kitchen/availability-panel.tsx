"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { FormSheet } from "@/components/form-sheet";
import { titleCase } from "@/lib/format";
import { trpc } from "@/lib/trpc-client";

/**
 * Bulk 86 / un-86: reuses menu.updateItemState (one call per selected dish)
 * rather than adding a bulk mutation — the same server rule (only an active
 * dish's availability can change) already applies per item.
 */
export function AvailabilityPanel({
	restaurantId,
	mode,
	onClose,
}: {
	restaurantId: string;
	mode: "unavailable" | "available";
	onClose: () => void;
}) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const items = trpc.kitchen.listAvailability.useQuery({ restaurantId });
	const utils = trpc.useUtils();
	const updateItemState = trpc.menu.updateItemState.useMutation();

	const candidates = (items.data ?? []).filter((item) =>
		mode === "unavailable"
			? item.availability === "available"
			: item.availability === "sold_out",
	);

	function toggle(id: string) {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	// allSettled, not all: one dish failing (e.g. hidden by another tab mid-
	// selection) must not swallow the others as an unhandled rejection — an
	// unhandled rejection here bypasses the inline error UI below. Succeeded
	// dishes commit either way; only the failed ones stay selected so
	// retrying is a single tap.
	async function handleConfirm() {
		const ids = [...selected];
		const results = await Promise.allSettled(
			ids.map((itemId) =>
				updateItemState.mutateAsync({
					restaurantId,
					itemId,
					action: mode === "unavailable" ? "mark_sold_out" : "mark_available",
				}),
			),
		);
		await utils.kitchen.listAvailability.invalidate({ restaurantId });
		const failedIds = ids.filter(
			(_, index) => results[index]?.status === "rejected",
		);
		if (failedIds.length === 0) {
			onClose();
			return;
		}
		setSelected(new Set(failedIds));
	}

	const isSubmitting = updateItemState.isPending;

	return (
		<FormSheet
			title={mode === "unavailable" ? "Mark Unavailable" : "Mark Available"}
			onClose={onClose}
			isSubmitting={isSubmitting}
			footer={
				<div className="flex gap-3">
					<button
						type="button"
						onClick={onClose}
						disabled={isSubmitting}
						className="flex-1 rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={isSubmitting || selected.size === 0}
						className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
					>
						{isSubmitting ? (
							<Loader2
								aria-hidden="true"
								className="icon-sm spinner"
								strokeWidth={1.5}
							/>
						) : null}
						{isSubmitting
							? mode === "unavailable"
								? "Marking unavailable"
								: "Marking available"
							: "Confirm"}
					</button>
				</div>
			}
		>
			{items.isPending ? (
				<p className="text-muted text-sm">Loading dishes…</p>
			) : candidates.length === 0 ? (
				<p className="text-muted text-sm">
					{mode === "unavailable"
						? "All dishes are available."
						: "No dishes are marked unavailable."}
				</p>
			) : (
				<div className="overflow-hidden rounded-xl border border-divider bg-surface">
					<div className="flex flex-col divide-y divide-divider">
						{candidates.map((item) => {
							const checked = selected.has(item.id);
							return (
								<button
									key={item.id}
									type="button"
									onClick={() => toggle(item.id)}
									className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated"
								>
									<span
										aria-hidden="true"
										className={`icon-md flex shrink-0 items-center justify-center rounded-sm border ${
											checked
												? "border-primary bg-primary"
												: "border-secondary bg-transparent"
										}`}
									>
										{checked ? (
											<Check
												className="icon-xs text-background"
												strokeWidth={1.5}
												aria-hidden="true"
											/>
										) : null}
									</span>
									<span className="text-primary text-sm">
										{titleCase(item.name)}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			)}
			{updateItemState.error ? (
				<p role="alert" className="mt-4 text-error text-sm">
					{updateItemState.error.message}
				</p>
			) : null}
		</FormSheet>
	);
}
