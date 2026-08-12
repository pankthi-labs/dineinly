"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";

export type PauseTarget = {
	id: string;
	name: string;
	nextStatus: "active" | "archived";
};

export function PauseConfirmDialog({
	target,
	onCancel,
	onConfirm,
	isPending,
}: {
	target: PauseTarget;
	onCancel: () => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	const isPausing = target.nextStatus === "archived";

	return (
		<ConfirmDialog
			titleId="pause-confirm-title"
			title={`${isPausing ? "Pause" : "Reactivate"} ${target.name}?`}
			body={
				isPausing
					? `Guests won't be able to order at ${target.name} until it's reactivated.`
					: `${target.name} will be visible to guests again.`
			}
			confirmLabel={isPausing ? "Pause" : "Reactivate"}
			pendingLabel="Saving…"
			onCancel={onCancel}
			onConfirm={onConfirm}
			isPending={isPending}
		/>
	);
}
