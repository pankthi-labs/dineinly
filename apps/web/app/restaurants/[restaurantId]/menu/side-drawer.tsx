"use client";

import { X } from "lucide-react";
import { type ReactNode, type RefObject, useEffect } from "react";

export function SideDrawer({
	title,
	titleId,
	children,
	onClose,
	isBusy = false,
	initialFocusRef,
}: {
	title: string;
	titleId: string;
	children: ReactNode;
	onClose: () => void;
	isBusy?: boolean;
	initialFocusRef?: RefObject<HTMLElement | null>;
}) {
	useEffect(() => {
		initialFocusRef?.current?.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !isBusy) {
				onClose();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [initialFocusRef, isBusy, onClose]);

	return (
		<div className="fixed inset-0 z-(--z-overlay)">
			<button
				type="button"
				aria-label={`Close ${title.toLowerCase()} panel`}
				onClick={onClose}
				disabled={isBusy}
				className="absolute inset-0 bg-background/80 backdrop-blur-sm"
			/>
			<aside
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className="absolute inset-y-0 right-0 z-(--z-modal) flex w-full max-w-xl flex-col border-divider border-l bg-surface shadow-(--shadow-lg)"
			>
				<header className="flex items-center justify-between border-divider border-b px-6 py-5">
					<h2 id={titleId} className="text-3xl text-primary">
						{title}
					</h2>
					<button
						type="button"
						aria-label={`Close ${title.toLowerCase()} panel`}
						onClick={onClose}
						disabled={isBusy}
						className="flex size-11 items-center justify-center text-muted transition-colors duration-(--duration-base) ease-out hover:text-primary disabled:cursor-not-allowed"
					>
						<X aria-hidden="true" className="icon-md" strokeWidth={1.5} />
					</button>
				</header>
				{children}
			</aside>
		</div>
	);
}
