"use client";

import { useEffect, useState } from "react";
import { useDismissableOverlay } from "@/components/use-dismissable-overlay";

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
	const [isVisible, setIsVisible] = useState(false);
	const containerRef = useDismissableOverlay<HTMLDivElement>(true, onCancel);

	useEffect(() => {
		const frame = requestAnimationFrame(() => setIsVisible(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	const isPausing = target.nextStatus === "archived";

	return (
		<div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-glass p-4">
			<div
				ref={containerRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="pause-confirm-title"
				className={`w-full max-w-sm rounded-xl border border-divider bg-surface-elevated p-8 shadow-lg transition-[opacity,transform] duration-(--duration-deliberate) ease-out ${
					isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
				}`}
			>
				<h2 id="pause-confirm-title" className="text-lg text-primary">
					{isPausing ? "Pause" : "Reactivate"} {target.name}?
				</h2>
				<p className="mt-3 text-secondary text-sm">
					{isPausing
						? `Guests won't be able to order at ${target.name} until it's reactivated.`
						: `${target.name} will be visible to guests again.`}
				</p>
				<div className="mt-8 flex justify-end gap-3">
					<button
						type="button"
						onClick={onCancel}
						disabled={isPending}
						className="rounded-sm px-4 py-2 text-secondary text-sm hover:text-primary disabled:cursor-not-allowed"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={isPending}
						aria-busy={isPending}
						className="rounded-md bg-accent px-6 py-2 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
					>
						{isPending ? "Saving…" : isPausing ? "Pause" : "Reactivate"}
					</button>
				</div>
			</div>
		</div>
	);
}
