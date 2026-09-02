"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { ROLE_LABEL } from "@/lib/format";
import { STATION_EMAIL_SUFFIX } from "@/lib/station-session";
import type { AppRouter } from "@/server/routers/_app";

type StaffListItem = inferRouterOutputs<AppRouter>["staff"]["list"][number];

const STATUS_LABEL: Record<StaffListItem["status"], string> = {
	invited: "Invited",
	active: "Active",
	removed: "Removed",
};

// Invited is neutral, not a warning state — an open invite needs nothing from
// the roster's viewer. The row's separate "Expired" badge is what carries the
// warning token once the 24h window lapses.
const STATUS_COLOR: Record<StaffListItem["status"], string> = {
	invited: "text-secondary",
	active: "text-success",
	removed: "text-muted",
};

const INVITE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function StaffRow({
	staff,
	hasPairedDevice,
	canManageThisRow,
	canRemoveThisRow,
	canReassignOwner,
	canResetPin,
	onEdit,
	onRemove,
	onReassign,
	onResetPin,
	onResendInvite,
}: {
	staff: StaffListItem;
	/** Whether this restaurant currently has at least one non-revoked
	 * station device (StationPanel's own live device list) — irrelevant for
	 * a real named staff row. staff.status on the shared station row is set
	 * once at first pairing and never changes afterward, so it can't answer
	 * "is a tablet actually paired right now"; this can. */
	hasPairedDevice: boolean;
	/** False for a Manager caller viewing any row whose role is Owner
	 * (docs/product.md § RBAC: "Managers may not manage Owners") — otherwise
	 * true, including the primary owner (name-only edit; role/email stay
	 * locked in the sheet itself). Gates Edit. */
	canManageThisRow: boolean;
	/** Narrower than canManageThisRow — false for the primary owner even
	 * when canManageThisRow is true (remove_staff rejects that row
	 * server-side; reassignment is the only way to remove them from the
	 * role). Gates Remove. */
	canRemoveThisRow: boolean;
	/** Only the current primary owner or Dineinly Admin — a different,
	 * stricter reach than canManageThisRow (a Manager never gets this). */
	canReassignOwner: boolean;
	/** Dineinly Admin only — the PIN-recovery override. */
	canResetPin: boolean;
	onEdit: () => void;
	onRemove: () => void;
	onReassign: () => void;
	onResetPin: () => void;
	onResendInvite: () => void;
}) {
	const isRemoved = staff.status === "removed";
	const isActive = staff.status === "active";
	const isInvited = staff.status === "invited";
	const isExpired =
		isInvited &&
		Date.now() - new Date(staff.invited_at).getTime() > INVITE_WINDOW_MS;
	// Only an existing Owner-role row is eligible — a Waiter/Manager/Kitchen
	// staff member must be promoted to Owner first (server-enforced too,
	// reassign_primary_owner's own role check).
	const showReassign =
		!isRemoved &&
		canReassignOwner &&
		!staff.is_primary_owner &&
		staff.role === "owner";
	// A shared station device never carries a PIN of its own — the PIN
	// belongs to whichever waiter unlocks it (docs/architecture.md § Station
	// Account Provisioning).
	const isStation = staff.email.endsWith(STATION_EMAIL_SUFFIX);
	const showResetPin = isActive && canResetPin && !isStation;
	// The shared station row's own status is never anything but "active"
	// once created (see the hasPairedDevice prop doc above) — swap it for
	// what's actually true right now: whether a tablet currently holds it.
	const statusLabel = isStation
		? hasPairedDevice
			? "Device Paired"
			: "No Device Paired"
		: STATUS_LABEL[staff.status];
	const statusColor = isStation
		? hasPairedDevice
			? "text-success"
			: "text-muted"
		: STATUS_COLOR[staff.status];
	// Same reach as invite_staff/canManageThisRow — resend_staff_invite
	// enforces the actual Manager-can't-touch-Owner rule server-side.
	const showResendInvite = isInvited && canManageThisRow;
	const hasActions =
		canManageThisRow ||
		canRemoveThisRow ||
		showReassign ||
		showResetPin ||
		showResendInvite;

	return (
		<div
			className={`flex flex-col gap-3 rounded-xl border border-divider bg-surface p-4 transition-colors duration-(--duration-base) ease-out ${isRemoved ? "opacity-60" : ""}`}
		>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<span className={`text-caps ${statusColor}`}>{statusLabel}</span>
				{isExpired ? (
					<span className="text-caps text-warning">Expired</span>
				) : null}
				{staff.is_primary_owner ? (
					<span className="text-accent-secondary text-caps">Primary Owner</span>
				) : null}
			</div>
			<h3 className="truncate text-lg text-primary">
				{isStation ? "Floor Tablet (Shared)" : (staff.name ?? staff.email)}
			</h3>
			<div className="flex flex-wrap gap-x-6 gap-y-1 text-secondary text-sm">
				<span>{ROLE_LABEL[staff.role]}</span>
				<span className="truncate">{staff.email}</span>
			</div>

			{/* Removed has no further action — there's no restore flow. Every
			action below is independently gated (edit/remove, reassign, PIN
			reset) — a row this caller can't manage may still show reassign
			and/or reset-PIN, since those are separate, sometimes wider reaches. */}
			{!isRemoved && hasActions ? (
				<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 border-divider border-t pt-3 text-caps">
					{canManageThisRow ? (
						<button
							type="button"
							onClick={onEdit}
							aria-label={`Edit ${staff.name ?? staff.email}`}
							className="shrink-0 text-secondary hover:text-primary"
						>
							Edit
						</button>
					) : null}
					{canRemoveThisRow ? (
						<button
							type="button"
							onClick={onRemove}
							aria-label={`Remove ${staff.name ?? staff.email}`}
							className="shrink-0 text-accent-secondary hover:opacity-80"
						>
							Remove
						</button>
					) : null}
					{showResendInvite ? (
						<button
							type="button"
							onClick={onResendInvite}
							aria-label={`Resend invite to ${staff.name ?? staff.email}`}
							className="shrink-0 text-secondary hover:text-primary"
						>
							Resend Invite
						</button>
					) : null}
					{showReassign ? (
						<button
							type="button"
							onClick={onReassign}
							aria-label={`Make ${staff.name ?? staff.email} the primary owner`}
							className="shrink-0 text-accent hover:opacity-80"
						>
							Make Primary Owner
						</button>
					) : null}
					{showResetPin ? (
						<button
							type="button"
							onClick={onResetPin}
							aria-label={`Reset ${staff.name ?? staff.email}'s PIN`}
							className="shrink-0 text-secondary hover:text-primary"
						>
							Reset PIN
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
