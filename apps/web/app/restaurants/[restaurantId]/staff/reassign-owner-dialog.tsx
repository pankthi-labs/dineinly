"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";

export type ReassignTarget = {
	id: string;
	name: string;
};

// A plain handoff, no extra field: both staff members stay role = 'owner'
// (server-enforced, reassign_primary_owner itself). A role downgrade for the
// outgoing owner is a separate Edit Staff action, not part of this one.
export function ReassignOwnerDialog({
	target,
	currentOwnerName,
	onCancel,
	onConfirm,
	isPending,
}: {
	target: ReassignTarget;
	currentOwnerName: string;
	onCancel: () => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	return (
		<ConfirmDialog
			titleId="reassign-owner-confirm-title"
			title={`Make ${target.name} the primary owner?`}
			body={`${currentOwnerName} will stop being the primary owner — still an Owner, just no longer the primary contact. This takes effect immediately.`}
			confirmLabel="Make Primary Owner"
			pendingLabel="Transferring…"
			onCancel={onCancel}
			onConfirm={onConfirm}
			isPending={isPending}
		/>
	);
}
