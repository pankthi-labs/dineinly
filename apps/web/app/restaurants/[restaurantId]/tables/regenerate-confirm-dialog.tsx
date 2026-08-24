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
	body = "The old printed QR code stops working immediately. Any table currently seated is unaffected.",
}: {
	target: RegenerateTarget;
	onCancel: () => void;
	onConfirm: () => void;
	isPending: boolean;
	/** Table Matrix's default assumes a seated table; the Menu package's one
	 * universal QR (qr/qr-code-section.tsx) has no tables to protect, so it
	 * passes its own copy. */
	body?: string;
}) {
	return (
		<ConfirmDialog
			titleId="regenerate-confirm-title"
			title={`Regenerate QR for ${target.label}?`}
			body={body}
			confirmLabel="Regenerate"
			pendingLabel="Regenerating…"
			onCancel={onCancel}
			onConfirm={onConfirm}
			isPending={isPending}
		/>
	);
}
