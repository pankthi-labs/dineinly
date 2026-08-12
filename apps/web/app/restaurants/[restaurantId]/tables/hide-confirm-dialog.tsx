"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";

export type HideTarget = {
	id: string;
	label: string;
	nextStatus: "active" | "archived";
};

export function HideConfirmDialog({
	target,
	onCancel,
	onConfirm,
	isPending,
}: {
	target: HideTarget;
	onCancel: () => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	const isHiding = target.nextStatus === "archived";

	return (
		<ConfirmDialog
			titleId="hide-confirm-title"
			title={`${isHiding ? "Hide" : "Show"} ${target.label}?`}
			body={
				isHiding
					? `${target.label} will drop off the Table Matrix and its QR code will stop letting guests in until it's shown again.`
					: `${target.label} will reappear on the Table Matrix and its QR code will work again.`
			}
			confirmLabel={isHiding ? "Hide" : "Show"}
			pendingLabel="Saving…"
			onCancel={onCancel}
			onConfirm={onConfirm}
			isPending={isPending}
		/>
	);
}
