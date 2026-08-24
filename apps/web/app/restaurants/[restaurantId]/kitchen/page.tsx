"use client";

import { ArrowRight, Check, CheckCircle2, Clock, Home } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { PoweredByDineinly } from "@/components/brand-logo";
import { titleCase } from "@/lib/format";
import {
	batchQueueItems,
	type KitchenBatch,
	staggerDelayMs,
} from "@/lib/kitchen-batches";
import { useBroadcastChannel } from "@/lib/realtime/use-broadcast-channel";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import { useIsAdmin, useIsCounter, useRestaurantRole } from "../viewer-context";
import { AvailabilityPanel } from "./availability-panel";

const CLOCK_TICK_MS = 30_000;

const COLUMN_STYLE: Record<
	KitchenBatch["status"],
	{ dot: string; count: string }
> = {
	placed: { dot: "bg-info", count: "text-info" },
	preparing: { dot: "bg-warning", count: "text-warning" },
	ready: { dot: "bg-success", count: "text-success" },
};

const ADVANCE_BUTTON_CLASS =
	"mt-1 flex items-center justify-center gap-2 rounded-md bg-accent px-6 py-4 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60";

function batchCountLabel(count: number): string {
	return `${count} batch${count === 1 ? "" : "es"}`;
}

// Waiter viewing the queue (View Kitchen Queue ✅, Update Order Status ❌) —
// same neutral, non-interactive shape as the Ready column's own action slot.
function renderAwaitingKitchenAction(): ReactNode {
	return (
		<div className="mt-1 flex items-center justify-center gap-2 rounded-md bg-surface-raised px-6 py-4 text-muted text-sm">
			<Clock className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
			Awaiting Kitchen
		</div>
	);
}

export default function KitchenDisplayPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const isAdmin = useIsAdmin();
	const restaurantRole = useRestaurantRole();
	// "Update Order Status (Preparing/Ready)" (docs/product.md § RBAC) is
	// Kitchen/Manager/Owner — Waiter reaches this page (View Kitchen Queue
	// ✅) but can't advance a batch. UX only — advanceBatch enforces the
	// real, server-side version of this same check.
	const canAdvance = isAdmin || restaurantRole !== "waiter";
	// "Serve Order (set Served)" is the inverse split — Waiter/Manager/Owner
	// for Full-Service, never Kitchen there. Counter swaps Kitchen in for
	// Waiter (self-service pickup, docs/product.md § Dineinly Experiences).
	// UX only — serveBatch enforces the real, server-side version.
	const isCounter = useIsCounter();
	const canServe =
		isAdmin ||
		(isCounter ? restaurantRole !== "waiter" : restaurantRole !== "kitchen");
	const [availabilityMode, setAvailabilityMode] = useState<
		"unavailable" | "available" | null
	>(null);
	// Forces batch elapsed-time labels to recompute between fetches.
	const [, setClockTick] = useState(0);

	useEffect(() => {
		const id = setInterval(
			() => setClockTick((tick) => tick + 1),
			CLOCK_TICK_MS,
		);
		return () => clearInterval(id);
	}, []);

	const queue = trpc.kitchen.listQueue.useQuery({ restaurantId });
	const utils = trpc.useUtils();

	// Staff realtime: the browser's Supabase Auth session (Email OTP /
	// station PIN sign-in) already carries this client's credentials —
	// supabase-js wires that session into Realtime auth automatically, no
	// separate token plumbing needed (contrast lib/realtime/use-guest-realtime,
	// where the guest JWT never reaches the browser on its own).
	// createClient() returns @supabase/ssr's cached browser singleton, so
	// this doesn't need its own memoization.
	const supabase = createClient();
	useBroadcastChannel(supabase, `restaurant:${restaurantId}`, {
		"order.new": () => utils.kitchen.listQueue.invalidate({ restaurantId }),
		"order_item.status": () =>
			utils.kitchen.listQueue.invalidate({ restaurantId }),
	});
	const advanceBatch = trpc.kitchen.advanceBatch.useMutation({
		onMutate: async (input) => {
			await utils.kitchen.listQueue.cancel({ restaurantId });
			const previous = utils.kitchen.listQueue.getData({ restaurantId });
			utils.kitchen.listQueue.setData({ restaurantId }, (current) => {
				if (!current) return current;
				const advancing = new Set(input.orderItemIds);
				return {
					...current,
					items: current.items.map((item) =>
						advancing.has(item.id) ? { ...item, status: input.to } : item,
					),
				};
			});
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				utils.kitchen.listQueue.setData({ restaurantId }, context.previous);
			}
		},
		onSettled: () => {
			utils.kitchen.listQueue.invalidate({ restaurantId });
		},
	});
	const serveBatch = trpc.kitchen.serveBatch.useMutation({
		onMutate: async (input) => {
			await utils.kitchen.listQueue.cancel({ restaurantId });
			const previous = utils.kitchen.listQueue.getData({ restaurantId });
			utils.kitchen.listQueue.setData({ restaurantId }, (current) => {
				if (!current) return current;
				const serving = new Set(input.orderItemIds);
				return {
					...current,
					items: current.items.filter((item) => !serving.has(item.id)),
				};
			});
			return { previous };
		},
		onError: (_error, _input, context) => {
			if (context?.previous) {
				utils.kitchen.listQueue.setData({ restaurantId }, context.previous);
			}
		},
		onSettled: () => {
			utils.kitchen.listQueue.invalidate({ restaurantId });
		},
	});

	if (queue.isPending) {
		return <KitchenLoading />;
	}
	if (queue.isError) {
		return <KitchenError onRetry={() => queue.refetch()} />;
	}
	if (!queue.data) {
		return <KitchenUnavailable />;
	}

	const items = queue.data.items;
	const incoming = batchQueueItems(
		items.filter((item) => item.status === "placed"),
	);
	const preparing = batchQueueItems(
		items.filter((item) => item.status === "preparing"),
	);
	const ready = batchQueueItems(
		items.filter((item) => item.status === "ready"),
	);

	function advance(batch: KitchenBatch, to: "preparing" | "ready") {
		advanceBatch.mutate({
			restaurantId,
			orderItemIds: batch.orderItemIds,
			to,
		});
	}

	function serve(batch: KitchenBatch) {
		serveBatch.mutate({ restaurantId, orderItemIds: batch.orderItemIds });
	}

	return (
		<div className="flex min-h-dvh flex-col bg-background text-primary md:h-dvh md:overflow-hidden">
			<header className="flex shrink-0 flex-col gap-3 border-divider border-b bg-surface px-4 py-4 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-8 md:px-8 md:py-5">
				<div className="min-w-0 md:justify-self-start">
					<p className="truncate text-2xl text-primary">
						{queue.data.restaurant.name}
					</p>
					<PoweredByDineinly className="mt-1" />
				</div>
				<h1 className="text-2xl text-primary md:justify-self-center md:whitespace-nowrap md:text-3xl">
					Kitchen Display
				</h1>
				<div className="flex flex-wrap items-center gap-3 md:shrink-0 md:flex-nowrap md:justify-self-end">
					<button
						type="button"
						onClick={() => setAvailabilityMode("unavailable")}
						className="shrink-0 whitespace-nowrap rounded-md border border-warning px-6 py-3 font-medium text-sm text-warning transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated"
					>
						Mark Unavailable
					</button>
					<button
						type="button"
						onClick={() => setAvailabilityMode("available")}
						className="shrink-0 whitespace-nowrap rounded-md border border-divider bg-surface-elevated px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface-raised"
					>
						Mark Available
					</button>
					<Link
						href={`/restaurants/${restaurantId}`}
						aria-label="Restaurant home"
						title="Restaurant home"
						className="icon-tap-target shrink-0 rounded-md text-secondary no-underline transition-colors duration-(--duration-base) ease-out hover:text-primary"
					>
						<Home className="icon-md" strokeWidth={1.5} aria-hidden="true" />
					</Link>
				</div>
			</header>

			<main className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
				<QueueColumn
					label="Incoming"
					status="placed"
					batches={incoming}
					renderAction={
						canAdvance
							? (batch) => (
									<button
										type="button"
										onClick={() => advance(batch, "preparing")}
										disabled={advanceBatch.isPending}
										className={ADVANCE_BUTTON_CLASS}
									>
										Start Preparing
										<ArrowRight
											className="icon-sm"
											strokeWidth={1.5}
											aria-hidden="true"
										/>
									</button>
								)
							: renderAwaitingKitchenAction
					}
				/>
				<QueueColumn
					label="Preparing"
					status="preparing"
					batches={preparing}
					renderAction={
						canAdvance
							? (batch) => (
									<button
										type="button"
										onClick={() => advance(batch, "ready")}
										disabled={advanceBatch.isPending}
										className={ADVANCE_BUTTON_CLASS}
									>
										Mark Ready
										<Check
											className="icon-sm"
											strokeWidth={1.5}
											aria-hidden="true"
										/>
									</button>
								)
							: renderAwaitingKitchenAction
					}
				/>
				<QueueColumn
					label="Ready"
					status="ready"
					batches={ready}
					dimmed
					renderAction={
						canServe
							? (batch) => (
									<button
										type="button"
										onClick={() => serve(batch)}
										disabled={serveBatch.isPending}
										className={ADVANCE_BUTTON_CLASS}
									>
										{isCounter ? "Picked Up" : "Mark Served"}
										<Check
											className="icon-sm"
											strokeWidth={1.5}
											aria-hidden="true"
										/>
									</button>
								)
							: () => (
									<div className="mt-1 flex items-center justify-center gap-2 rounded-md bg-surface-raised px-6 py-4 text-primary text-sm">
										<CheckCircle2
											className="icon-sm text-success"
											strokeWidth={1.5}
											aria-hidden="true"
										/>
										Awaiting Pickup
									</div>
								)
					}
				/>
			</main>

			{availabilityMode ? (
				<AvailabilityPanel
					restaurantId={restaurantId}
					mode={availabilityMode}
					onClose={() => setAvailabilityMode(null)}
				/>
			) : null}
		</div>
	);
}

function QueueColumn({
	label,
	status,
	batches,
	dimmed = false,
	renderAction,
}: {
	label: string;
	status: KitchenBatch["status"];
	batches: KitchenBatch[];
	dimmed?: boolean;
	renderAction: (batch: KitchenBatch) => React.ReactNode;
}) {
	return (
		<section className="flex flex-col border-divider border-b last:border-b-0 md:flex-1 md:overflow-hidden md:border-r md:border-b-0 md:last:border-r-0">
			<div className="flex shrink-0 items-center gap-2 px-6 py-4">
				<span
					aria-hidden="true"
					className={`h-2 w-2 shrink-0 rounded-full ${COLUMN_STYLE[status].dot}`}
				/>
				<h2 className="text-primary text-xl">{label}</h2>
				<span className={`text-base ${COLUMN_STYLE[status].count}`}>
					{batchCountLabel(batches.length)}
				</span>
			</div>
			<div className="flex flex-col gap-3 px-5 pb-5 md:flex-1 md:overflow-y-auto">
				{batches.length === 0 ? (
					<p className="px-1 text-muted text-sm">No dishes.</p>
				) : (
					batches.map((batch, index) => (
						<BatchCard
							key={batch.key}
							batch={batch}
							delayMs={staggerDelayMs(index)}
							dimmed={dimmed}
							action={renderAction(batch)}
						/>
					))
				)}
			</div>
		</section>
	);
}

function BatchCard({
	batch,
	delayMs,
	dimmed,
	action,
}: {
	batch: KitchenBatch;
	delayMs: number;
	dimmed: boolean;
	action: React.ReactNode;
}) {
	const statusLabel =
		batch.status === "placed"
			? "Incoming"
			: batch.overdue
				? "Overdue"
				: titleCase(batch.status);
	const statusColor =
		batch.status === "placed"
			? "text-info"
			: batch.overdue
				? "text-error"
				: batch.status === "ready"
					? "text-success"
					: "text-warning";

	return (
		<div
			className={`card-enter flex shrink-0 flex-col gap-4 rounded-xl border border-divider bg-surface-elevated p-5 ${dimmed ? "opacity-90" : ""}`}
			style={{ animationDelay: `${delayMs}ms` }}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-primary text-xl">{titleCase(batch.dish)}</p>
					<div className="mt-2 flex items-center gap-2">
						<span className={`text-caps ${statusColor}`}>{statusLabel}</span>
					</div>
					<p className="mt-2 flex items-center gap-2 text-secondary text-sm">
						<Clock className="icon-xs" strokeWidth={1.5} aria-hidden="true" />
						{batch.timeLabel}
					</p>
				</div>
				<span className="shrink-0 text-3xl text-primary">{batch.quantity}</span>
			</div>
			<div className="flex flex-wrap gap-2">
				{batch.tables.map((table) => (
					<span
						key={table.label}
						className="flex items-center gap-2 whitespace-nowrap rounded-pill bg-surface-raised px-4 py-2 text-secondary text-xs"
					>
						Table {table.label}
						<span className="font-medium text-primary">× {table.quantity}</span>
					</span>
				))}
			</div>
			{action}
		</div>
	);
}

function KitchenLoading() {
	return (
		<div className="flex h-dvh items-center justify-center bg-background text-primary">
			<p className="text-muted">Loading kitchen queue…</p>
		</div>
	);
}
function KitchenError({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-dvh items-center justify-center bg-background text-primary">
			<div className="rounded-xl border border-divider bg-surface p-6">
				<p className="text-caps text-muted">Kitchen queue unavailable</p>
				<h1 className="mt-3 text-3xl">We couldn’t load the order queue.</h1>
				<button
					type="button"
					onClick={onRetry}
					className="mt-6 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm"
				>
					Try again
				</button>
			</div>
		</div>
	);
}
function KitchenUnavailable() {
	return (
		<div className="flex h-dvh items-center justify-center bg-background text-primary">
			<div className="rounded-xl border border-divider bg-surface p-6">
				<p className="text-caps text-muted">Restaurant not found</p>
				<h1 className="mt-3 text-3xl">
					No kitchen queue is available for this restaurant.
				</h1>
			</div>
		</div>
	);
}
