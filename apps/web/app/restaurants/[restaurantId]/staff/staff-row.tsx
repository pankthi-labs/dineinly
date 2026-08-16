"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { StaffRole } from "@/lib/auth";
import type { AppRouter } from "@/server/routers/_app";

type StaffListItem = inferRouterOutputs<AppRouter>["staff"]["list"][number];

const STATUS_LABEL: Record<StaffListItem["status"], string> = {
	invited: "Invited",
	active: "Active",
	removed: "Removed",
};

const STATUS_COLOR: Record<StaffListItem["status"], string> = {
	invited: "text-accent-support",
	active: "text-success",
	removed: "text-muted",
};

const ROLE_LABEL: Record<StaffRole, string> = {
	waiter: "Waiter",
	kitchen: "Kitchen",
	manager: "Manager",
	owner: "Owner",
};

export function StaffRow({
	staff,
	canManageThisRow,
	onEdit,
	onRemove,
}: {
	staff: StaffListItem;
	/** False for the primary owner (locked — reassignment isn't built, see
	 * Tbd.md) and, for a Manager caller, any row whose role is Owner
	 * (docs/product.md § RBAC: "Managers may not manage Owners"). */
	canManageThisRow: boolean;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const isRemoved = staff.status === "removed";

	return (
		<div
			className={`flex flex-col gap-3 rounded-xl border border-divider bg-surface p-4 transition-colors duration-(--duration-base) ease-out ${isRemoved ? "opacity-60" : ""}`}
		>
			<span className={`text-caps ${STATUS_COLOR[staff.status]}`}>
				{STATUS_LABEL[staff.status]}
			</span>
			<h3 className="truncate text-lg text-primary">
				{staff.name ?? staff.email}
			</h3>
			<div className="flex flex-wrap gap-x-6 gap-y-1 text-secondary text-sm">
				<span>{ROLE_LABEL[staff.role]}</span>
				<span className="truncate">{staff.email}</span>
			</div>

			{/* Removed has no further action — there's no restore flow — and a
			row this caller can't manage (primary owner, or an Owner row seen by
			a Manager) shows no actions at all rather than disabled ones: neither
			case is a server call this state would ever accept. */}
			{!isRemoved && canManageThisRow ? (
				<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 border-divider border-t pt-3 text-caps">
					<button
						type="button"
						onClick={onEdit}
						aria-label={`Edit ${staff.name ?? staff.email}`}
						className="text-accent hover:opacity-80"
					>
						Edit Staff
					</button>
					<button
						type="button"
						onClick={onRemove}
						aria-label={`Remove ${staff.name ?? staff.email}`}
						className="text-accent-secondary hover:opacity-80"
					>
						Remove
					</button>
				</div>
			) : null}
		</div>
	);
}
