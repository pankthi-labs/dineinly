"use client";

import { Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import { trpc } from "@/lib/trpc-client";
import { AdminNavHeader } from "../admin-nav-header";
import type { EditTarget } from "./admin-form-sheet";
import { AdminFormSheet } from "./admin-form-sheet";
import { AdminRow } from "./admin-row";
import type { RemoveTarget } from "./remove-admin-confirm-dialog";
import { RemoveAdminConfirmDialog } from "./remove-admin-confirm-dialog";

export default function DineinlyStaffPage() {
	const [sheetMode, setSheetMode] = useState<"closed" | "create" | "edit">(
		"closed",
	);
	const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
	const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
	const [toast, setToast] = useState<ToastState | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	const utils = trpc.useUtils();
	const meQuery = trpc.auth.me.useQuery();
	const listQuery = trpc.adminStaff.list.useQuery();

	function invalidateAndNotify(message: string) {
		utils.adminStaff.list.invalidate();
		setToast({ message, tone: "success" });
	}

	function notifyError(error: { message: string }) {
		setSubmitError(error.message);
	}

	const inviteMutation = trpc.adminStaff.invite.useMutation({
		onSuccess: () => {
			setSheetMode("closed");
			invalidateAndNotify("Admin invited.");
		},
		onError: notifyError,
	});

	const updateMutation = trpc.adminStaff.update.useMutation({
		onSuccess: () => {
			setSheetMode("closed");
			invalidateAndNotify("Admin updated.");
		},
		onError: notifyError,
	});

	const removeMutation = trpc.adminStaff.remove.useMutation({
		onSuccess: () => {
			setRemoveTarget(null);
			invalidateAndNotify("Admin removed.");
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

	function openEditSheet(admin: { id: string; name: string | null }) {
		setSubmitError(null);
		setEditTarget({ id: admin.id, name: admin.name ?? "" });
		setSheetMode("edit");
	}

	const isSubmitting = inviteMutation.isPending || updateMutation.isPending;
	const adminList = listQuery.data ?? [];
	const searchTerm = search.trim().toLowerCase();
	const filteredAdmins = adminList.filter((admin) => {
		if (!searchTerm) return true;
		return (
			(admin.name ?? "").toLowerCase().includes(searchTerm) ||
			admin.email.toLowerCase().includes(searchTerm)
		);
	});
	// Self-removal is blocked server-side too — hiding it here just avoids a
	// button that would always fail. Removing the last remaining admin is
	// also server-blocked but not predictable client-side (any of the rows
	// could be "the last one" once another is removed), so that guard only
	// ever surfaces as a toast on submit.
	const callerId = meQuery.data?.id;

	return (
		<div className="min-h-dvh bg-background text-primary">
			<AdminNavHeader active="Dineinly Staff" />

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<PageHeader
					search={{
						value: search,
						onChange: setSearch,
						label: "Search by name or email",
					}}
					title="Dineinly Staff"
					description="Invite, edit, and remove Dineinly Admin access."
					actions={
						<button
							type="button"
							onClick={openCreateSheet}
							className="flex shrink-0 items-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover"
						>
							<Plus className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
							Invite Admin
						</button>
					}
				/>

				<div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{listQuery.isPending ? (
						Array.from({ length: 3 }, (_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders never reorder.
								key={i}
								className="skeleton h-24 rounded-xl border border-divider"
							/>
						))
					) : listQuery.isError ? (
						<div className="col-span-full rounded-xl border border-divider bg-surface p-8 text-center">
							<p role="alert" className="text-error text-sm">
								Couldn't load Dineinly Staff: {listQuery.error.message}
							</p>
							<button
								type="button"
								onClick={() => listQuery.refetch()}
								className="mt-4 text-accent text-caps hover:opacity-80"
							>
								Retry
							</button>
						</div>
					) : adminList.length === 0 ? (
						<div className="col-span-full flex flex-col items-center gap-4 rounded-xl border border-divider bg-surface p-16 text-center">
							<Users
								className="icon-xl text-muted"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<p className="text-primary">No Dineinly Admins yet.</p>
							<button
								type="button"
								onClick={openCreateSheet}
								className="text-accent text-caps hover:opacity-80"
							>
								Invite your first admin
							</button>
						</div>
					) : filteredAdmins.length === 0 ? (
						<div className="col-span-full flex flex-col items-center gap-4 rounded-xl border border-divider bg-surface p-16 text-center">
							<Search
								className="icon-xl text-muted"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<p className="text-primary">No admins match your search.</p>
						</div>
					) : (
						filteredAdmins.map((admin) => (
							<AdminRow
								key={admin.id}
								admin={admin}
								canManageThisRow={admin.id !== callerId}
								onEdit={() => openEditSheet(admin)}
								onRemove={() =>
									setRemoveTarget({
										id: admin.id,
										name: admin.name ?? admin.email,
									})
								}
							/>
						))
					)}
				</div>
			</main>

			{sheetMode !== "closed" ? (
				<AdminFormSheet
					editTarget={editTarget}
					onClose={() => setSheetMode("closed")}
					onCreate={(values) => inviteMutation.mutate(values)}
					onUpdate={(id, name) => updateMutation.mutate({ id, name })}
					isSubmitting={isSubmitting}
					submitError={submitError}
				/>
			) : null}

			{removeTarget ? (
				<RemoveAdminConfirmDialog
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
