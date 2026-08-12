"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type TableListItem = inferRouterOutputs<AppRouter>["tables"]["list"][number];

export function TableCard({
	table,
	onOpenQr,
	onEdit,
	onRegenerate,
	onRequestStatusChange,
}: {
	table: TableListItem;
	onOpenQr: () => void;
	onEdit: () => void;
	onRegenerate: () => void;
	onRequestStatusChange: () => void;
}) {
	const isHidden = table.status === "archived";
	const isOccupied = table.session_id !== null;

	const stateLabel = isHidden ? "Hidden" : isOccupied ? "Occupied" : "Free";
	const stateColor = isHidden
		? "text-secondary"
		: isOccupied
			? "text-accent-secondary"
			: "text-success";

	return (
		<div
			className={`flex flex-col gap-3 rounded-xl border border-divider bg-surface p-4 transition-colors duration-(--duration-base) ease-out ${isHidden ? "opacity-60" : ""}`}
		>
			<span className={`text-caps ${stateColor}`}>{stateLabel}</span>
			<h3 className="truncate text-lg text-primary">{table.label}</h3>
			<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 border-divider border-t pt-3 text-caps">
				<button
					type="button"
					onClick={onOpenQr}
					disabled={isHidden}
					aria-label={`Show QR for ${table.label}`}
					className="text-accent hover:opacity-80 disabled:cursor-not-allowed disabled:text-muted disabled:hover:opacity-100"
				>
					Show QR
				</button>
				{/* Occupied: table config is off-limits mid-service — only Show QR
				stays. Not rendered, not just disabled, so there's no stale handler
				to fire and no server call this state doesn't already reject. */}
				{!isOccupied && (
					<>
						<button
							type="button"
							onClick={onEdit}
							aria-label={`Edit ${table.label}`}
							className="text-secondary hover:text-primary"
						>
							Edit
						</button>
						<button
							type="button"
							onClick={onRegenerate}
							disabled={isHidden}
							aria-label={`Regenerate QR for ${table.label}`}
							className="text-secondary hover:text-primary disabled:cursor-not-allowed disabled:text-muted"
						>
							Regenerate
						</button>
						<button
							type="button"
							onClick={onRequestStatusChange}
							aria-label={`${isHidden ? "Show" : "Hide"} ${table.label}`}
							className="text-accent-secondary hover:opacity-80"
						>
							{isHidden ? "Show" : "Hide"}
						</button>
					</>
				)}
			</div>
		</div>
	);
}
