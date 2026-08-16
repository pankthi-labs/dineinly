"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { Plus, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import type { StaffRole } from "@/lib/auth";
import { trpc } from "@/lib/trpc-client";
import type { AppRouter } from "@/server/routers/_app";
import { RestaurantNavHeader } from "../restaurant-nav-header";
import { useIsAdmin, useRestaurantRole } from "../viewer-context";
import type { RemoveTarget } from "./remove-staff-confirm-dialog";
import { RemoveStaffConfirmDialog } from "./remove-staff-confirm-dialog";
import type { EditTarget, StaffFormValues } from "./staff-form-sheet";
import { StaffFormSheet } from "./staff-form-sheet";
import { StaffRow } from "./staff-row";

type StaffListItem = inferRouterOutputs<AppRouter>["staff"]["list"][number];

const ALL_ROLES: StaffRole[] = ["waiter", "kitchen", "manager", "owner"];

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
// offering a choice the server would reject.
function availableRolesFor(
	viewerIsAdmin: boolean,
	viewerRole: StaffRole | null,
): StaffRole[] {
	return isOwnerLevel(viewerIsAdmin, viewerRole)
		? ALL_ROLES
		: ALL_ROLES.filter((role) => role !== "owner");
}

// The primary owner row is locked (reassignment isn't built, see Tbd.md —
// "Owner reassignment") — server-enforced identically, for every caller
// including Admin (update_staff/remove_staff's is_primary_owner check).
function canManageRow(
	staff: StaffListItem,
	viewerIsAdmin: boolean,
	viewerRole: StaffRole | null,
): boolean {
	if (staff.is_primary_owner) return false;
	return isOwnerLevel(viewerIsAdmin, viewerRole) || staff.role !== "owner";
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

	const [sheetMode, setSheetMode] = useState<"closed" | "create" | "edit">(
		"closed",
	);
	const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
	const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);

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
		});
		setSheetMode("edit");
	}

	const isSubmitting = inviteMutation.isPending || updateMutation.isPending;
	const availableRoles = availableRolesFor(viewerIsAdmin, viewerRole);

	const staffList = listQuery.data ?? [];
	const sortedStaff = [...staffList].sort(
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

				<div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
								onEdit={() => openEditSheet(staff)}
								onRemove={() =>
									setRemoveTarget({
										id: staff.id,
										name: staff.name ?? staff.email,
									})
								}
							/>
						))
					)}
				</div>
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

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}
