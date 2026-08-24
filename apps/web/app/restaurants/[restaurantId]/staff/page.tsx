"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { Plus, Search, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import type { StaffRole } from "@/lib/auth";
import { visibleFilters } from "@/lib/filter-pills";
import { ROLE_LABEL } from "@/lib/format";
import { STATION_EMAIL_SUFFIX } from "@/lib/station-session";
import { trpc } from "@/lib/trpc-client";
import type { AppRouter } from "@/server/routers/_app";
import { RestaurantNavHeader } from "../restaurant-nav-header";
import {
	useCanReassignOwner,
	useIsAdmin,
	useIsMenuOnly,
	useRestaurantRole,
} from "../viewer-context";
import type { ReassignTarget } from "./reassign-owner-dialog";
import { ReassignOwnerDialog } from "./reassign-owner-dialog";
import type { RemoveTarget } from "./remove-staff-confirm-dialog";
import { RemoveStaffConfirmDialog } from "./remove-staff-confirm-dialog";
import type { ResetPinTarget } from "./reset-pin-sheet";
import { ResetPinSheet } from "./reset-pin-sheet";
import type { EditTarget, StaffFormValues } from "./staff-form-sheet";
import { StaffFormSheet } from "./staff-form-sheet";
import { StaffRow } from "./staff-row";
import { StationPanel } from "./station-panel";

type StaffListItem = inferRouterOutputs<AppRouter>["staff"]["list"][number];

const ALL_ROLES: StaffRole[] = ["waiter", "kitchen", "manager", "owner"];
const ROLE_FILTERS: Array<{ value: StaffRole | "all"; label: string }> = [
	{ value: "all", label: "All" },
	...ALL_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
];

// Owner and Dineinly Admin may touch an Owner-role row or hand out the Owner
// role; a Manager may not do either — docs/product.md § RBAC: "Managers may
// not invite Owners" (and, by the same line, may not otherwise manage them).
function isOwnerLevel(
	viewerIsAdmin: boolean,
	viewerRole: StaffRole | null,
): boolean {
	return viewerIsAdmin || viewerRole === "owner";
}

// Server-enforced too (invite_staff/update_staff, supabase/migrations/
// 20260816164344_add_staff_roster_rpcs.sql); this only keeps the form from
// offering a choice the server would reject. Dineinly Menu has no Waiter or
// Kitchen roles at all — no PIN stations, no floor/kitchen flows to staff
// (docs/product.md § Dineinly Experiences).
function availableRolesFor(
	viewerIsAdmin: boolean,
	viewerRole: StaffRole | null,
	isMenuOnly: boolean,
): StaffRole[] {
	const roles = isOwnerLevel(viewerIsAdmin, viewerRole)
		? ALL_ROLES
		: ALL_ROLES.filter((role) => role !== "owner");
	return isMenuOnly
		? roles.filter((role) => role !== "waiter" && role !== "kitchen")
		: roles;
}

// The primary owner's role/email are locked — reassign_primary_owner is the
// only way to touch those (see ReassignOwnerDialog below), same as remove
// (never allowed for this row, see canRemoveRow) — but their name is
// editable like any other owner-level row, server-enforced identically
// (update_staff's is_primary_owner check permits a name-only change).
function canManageRow(
	staff: StaffListItem,
	viewerIsAdmin: boolean,
	viewerRole: StaffRole | null,
): boolean {
	// A shared station device's own row is managed from Floor Tablets
	// (station-panel.tsx) — pairing and revoking, never edit/remove. Removing
	// it here would leave the restaurant unable to pair a tablet at all.
	if (staff.email.endsWith(STATION_EMAIL_SUFFIX)) return false;
	return isOwnerLevel(viewerIsAdmin, viewerRole) || staff.role !== "owner";
}

// Narrower than canManageRow — the primary owner is never removable here,
// only reassigned (remove_staff's is_primary_owner check rejects it too).
function canRemoveRow(
	staff: StaffListItem,
	viewerIsAdmin: boolean,
	viewerRole: StaffRole | null,
): boolean {
	return (
		!staff.is_primary_owner && canManageRow(staff, viewerIsAdmin, viewerRole)
	);
}

// Active first (actionable), then Invited (pending), Removed last — same
// "actionable first" reasoning as Table Matrix's statusRank.
function statusRank(staff: StaffListItem): number {
	if (staff.status === "removed") return 2;
	if (staff.status === "invited") return 1;
	return 0;
}

export default function StaffRosterPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const viewerIsAdmin = useIsAdmin();
	const viewerRole = useRestaurantRole();
	const canReassignOwner = useCanReassignOwner();
	const isMenuOnly = useIsMenuOnly();

	const [sheetMode, setSheetMode] = useState<"closed" | "create" | "edit">(
		"closed",
	);
	const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
	const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
	const [reassignTarget, setReassignTarget] = useState<ReassignTarget | null>(
		null,
	);
	const [resetPinTarget, setResetPinTarget] = useState<ResetPinTarget | null>(
		null,
	);
	const [toast, setToast] = useState<ToastState | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [resetPinError, setResetPinError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState<StaffRole | "all">("all");

	const utils = trpc.useUtils();
	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const listQuery = trpc.staff.list.useQuery({ restaurantId });

	function invalidateAndNotify(message: string) {
		utils.staff.list.invalidate({ restaurantId });
		setToast({ message, tone: "success" });
	}

	function notifyError(error: { message: string }) {
		setSubmitError(error.message);
	}

	const inviteMutation = trpc.staff.invite.useMutation({
		onSuccess: () => {
			setSheetMode("closed");
			invalidateAndNotify("Staff member invited.");
		},
		onError: notifyError,
	});

	const updateMutation = trpc.staff.update.useMutation({
		onSuccess: () => {
			setSheetMode("closed");
			invalidateAndNotify("Staff member updated.");
		},
		onError: notifyError,
	});

	const removeMutation = trpc.staff.remove.useMutation({
		onSuccess: () => {
			setRemoveTarget(null);
			invalidateAndNotify("Staff member removed.");
		},
		onError: (error) => {
			setRemoveTarget(null);
			setToast({ message: error.message, tone: "error" });
		},
	});

	const reassignOwnerMutation = trpc.staff.reassignOwner.useMutation({
		onSuccess: () => {
			setReassignTarget(null);
			invalidateAndNotify("Primary owner updated.");
		},
		onError: (error) => {
			setReassignTarget(null);
			setToast({ message: error.message, tone: "error" });
		},
	});

	const resendInviteMutation = trpc.staff.resendInvite.useMutation({
		onSuccess: () => invalidateAndNotify("Invite resent — valid for 24 hours."),
		onError: (error) => setToast({ message: error.message, tone: "error" }),
	});

	const adminResetPinMutation = trpc.staff.adminResetPin.useMutation({
		onSuccess: () => {
			setResetPinTarget(null);
			setResetPinError(null);
			setToast({ message: "PIN reset.", tone: "success" });
		},
		onError: (error) => setResetPinError(error.message),
	});

	function openCreateSheet() {
		setSubmitError(null);
		setEditTarget(null);
		setSheetMode("create");
	}

	function openEditSheet(staff: StaffListItem) {
		setSubmitError(null);
		setEditTarget({
			id: staff.id,
			values: {
				name: staff.name ?? "",
				email: staff.email,
				role: staff.role,
			},
			status: staff.status,
			isPrimaryOwner: staff.is_primary_owner,
		});
		setSheetMode("edit");
	}

	const isSubmitting = inviteMutation.isPending || updateMutation.isPending;
	const availableRoles = availableRolesFor(
		viewerIsAdmin,
		viewerRole,
		isMenuOnly,
	);

	const staffList = listQuery.data ?? [];
	const currentOwner = staffList.find((staff) => staff.is_primary_owner);
	const rolesPresent = ALL_ROLES.filter((role) =>
		staffList.some((staff) => staff.role === role),
	);
	const roleFilters = visibleFilters(ROLE_FILTERS, rolesPresent);
	const searchTerm = search.trim().toLowerCase();
	const filteredStaff = staffList.filter((staff) => {
		if (roleFilter !== "all" && staff.role !== roleFilter) return false;
		if (!searchTerm) return true;
		return (
			(staff.name ?? "").toLowerCase().includes(searchTerm) ||
			staff.email.toLowerCase().includes(searchTerm)
		);
	});
	const sortedStaff = filteredStaff.sort(
		(a, b) =>
			statusRank(a) - statusRank(b) ||
			(a.name ?? a.email).localeCompare(b.name ?? b.email),
	);

	return (
		<div className="min-h-dvh bg-background text-primary">
			<RestaurantNavHeader
				restaurantId={restaurantId}
				restaurantName={restaurantQuery.data?.name ?? ""}
				active="Staff Roster"
			/>

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<PageHeader
					search={{
						value: search,
						onChange: setSearch,
						label: "Search by name or email",
					}}
					title="Staff Roster"
					description="Invite staff, manage roles, and remove access."
					actions={
						<button
							type="button"
							onClick={openCreateSheet}
							className="flex shrink-0 items-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover"
						>
							<Plus className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
							Add Staff
						</button>
					}
				/>

				{roleFilters.length === 0 ? null : (
					<div className="mt-8 flex flex-wrap items-center gap-2">
						{roleFilters.map(({ value, label }) => (
							<button
								key={value}
								type="button"
								onClick={() => setRoleFilter(value)}
								aria-pressed={roleFilter === value}
								className={`rounded-pill border px-4 py-2 font-medium text-sm transition-colors duration-(--duration-base) ease-out ${
									roleFilter === value
										? "border-accent text-primary"
										: "border-divider text-secondary hover:text-primary"
								}`}
							>
								{label}
							</button>
						))}
					</div>
				)}

				<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{listQuery.isPending ? (
						Array.from({ length: 6 }, (_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders never reorder.
								key={i}
								className="skeleton h-24 rounded-xl border border-divider"
							/>
						))
					) : listQuery.isError ? (
						<div className="col-span-full rounded-xl border border-divider bg-surface p-8 text-center">
							<p role="alert" className="text-error text-sm">
								Couldn't load the staff roster: {listQuery.error.message}
							</p>
							<button
								type="button"
								onClick={() => listQuery.refetch()}
								className="mt-4 text-accent text-caps hover:opacity-80"
							>
								Retry
							</button>
						</div>
					) : staffList.length === 0 ? (
						<div className="col-span-full flex flex-col items-center gap-4 rounded-xl border border-divider bg-surface p-16 text-center">
							<Users
								className="icon-xl text-muted"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<p className="text-primary">No staff yet.</p>
							<button
								type="button"
								onClick={openCreateSheet}
								className="text-accent text-caps hover:opacity-80"
							>
								Invite your first staff member
							</button>
						</div>
					) : sortedStaff.length === 0 ? (
						<div className="col-span-full flex flex-col items-center gap-4 rounded-xl border border-divider bg-surface p-16 text-center">
							<Search
								className="icon-xl text-muted"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<p className="text-primary">No staff match your search.</p>
						</div>
					) : (
						sortedStaff.map((staff) => (
							<StaffRow
								key={staff.id}
								staff={staff}
								canManageThisRow={canManageRow(
									staff,
									viewerIsAdmin,
									viewerRole,
								)}
								canRemoveThisRow={canRemoveRow(
									staff,
									viewerIsAdmin,
									viewerRole,
								)}
								canReassignOwner={canReassignOwner}
								canResetPin={viewerIsAdmin && !isMenuOnly}
								onEdit={() => openEditSheet(staff)}
								onRemove={() =>
									setRemoveTarget({
										id: staff.id,
										name: staff.name ?? staff.email,
									})
								}
								onReassign={() =>
									setReassignTarget({
										id: staff.id,
										name: staff.name ?? staff.email,
									})
								}
								onResetPin={() => {
									setResetPinError(null);
									setResetPinTarget({
										id: staff.id,
										name: staff.name ?? staff.email,
									});
								}}
								onResendInvite={() =>
									resendInviteMutation.mutate({ id: staff.id })
								}
							/>
						))
					)}
				</div>

				{!isMenuOnly &&
				(viewerIsAdmin ||
					viewerRole === "owner" ||
					viewerRole === "manager") ? (
					<StationPanel restaurantId={restaurantId} />
				) : null}
			</main>

			{sheetMode !== "closed" ? (
				<StaffFormSheet
					editTarget={editTarget}
					availableRoles={availableRoles}
					onClose={() => setSheetMode("closed")}
					onCreate={(values: StaffFormValues) =>
						inviteMutation.mutate({ restaurantId, ...values })
					}
					onUpdate={(id: string, values: StaffFormValues) =>
						updateMutation.mutate({ id, ...values })
					}
					isSubmitting={isSubmitting}
					submitError={submitError}
				/>
			) : null}

			{removeTarget ? (
				<RemoveStaffConfirmDialog
					target={removeTarget}
					onCancel={() => setRemoveTarget(null)}
					onConfirm={() => removeMutation.mutate({ id: removeTarget.id })}
					isPending={removeMutation.isPending}
				/>
			) : null}

			{reassignTarget ? (
				<ReassignOwnerDialog
					target={reassignTarget}
					currentOwnerName={
						currentOwner?.name ?? currentOwner?.email ?? "the current owner"
					}
					onCancel={() => setReassignTarget(null)}
					onConfirm={() =>
						reassignOwnerMutation.mutate({
							restaurantId,
							newOwnerStaffId: reassignTarget.id,
						})
					}
					isPending={reassignOwnerMutation.isPending}
				/>
			) : null}

			{resetPinTarget ? (
				<ResetPinSheet
					target={resetPinTarget}
					onClose={() => setResetPinTarget(null)}
					onSubmit={(pin) =>
						adminResetPinMutation.mutate({ staffId: resetPinTarget.id, pin })
					}
					isSubmitting={adminResetPinMutation.isPending}
					submitError={resetPinError}
				/>
			) : null}

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}
