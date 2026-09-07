"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";
import type { RestaurantExperience } from "@/components/restaurant-fields-fieldset";

export type PauseTarget = {
	id: string;
	name: string;
	experience: RestaurantExperience;
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
	// Dineinly Menu is view-only — no ordering to lose (docs/product.md §
	// Dineinly Experiences) — so pausing it reads as "can't view the menu,"
	// not "can't order," unlike Guest/One/Counter.
	const guestAction =
		target.experience === "menu" ? "view the menu at" : "order at";

	return (
		<ConfirmDialog
			titleId="pause-confirm-title"
			title={`${isPausing ? "Pause" : "Reactivate"} ${target.name}?`}
			body={
				isPausing
					? `Guests won't be able to ${guestAction} ${target.name} until it's reactivated. Any guests currently browsing will be signed out.`
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
