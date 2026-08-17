"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";

export type RemoveTarget = {
	id: string;
	name: string;
};

export function RemoveAdminConfirmDialog({
	target,
	onCancel,
	onConfirm,
	isPending,
}: {
	target: RemoveTarget;
	onCancel: () => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	return (
		<ConfirmDialog
			titleId="remove-admin-confirm-title"
			title={`Remove ${target.name}?`}
			body="This can't be undone from here — they lose Dineinly Admin access immediately, and re-adding them means a fresh invite."
			confirmLabel="Remove"
			pendingLabel="Removing…"
			onCancel={onCancel}
			onConfirm={onConfirm}
			isPending={isPending}
		/>
	);
}
