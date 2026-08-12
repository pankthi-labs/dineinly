"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";

export type RegenerateTarget = {
	id: string;
	label: string;
};

export function RegenerateConfirmDialog({
	target,
	onCancel,
	onConfirm,
	isPending,
}: {
	target: RegenerateTarget;
	onCancel: () => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	return (
		<ConfirmDialog
			titleId="regenerate-confirm-title"
			title={`Regenerate QR for ${target.label}?`}
			body="The old printed QR code stops working immediately. Any table currently seated is unaffected."
			confirmLabel="Regenerate"
			pendingLabel="Regenerating…"
			onCancel={onCancel}
			onConfirm={onConfirm}
			isPending={isPending}
		/>
	);
}
