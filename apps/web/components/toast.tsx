"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export type ToastState = { message: string; tone: "success" | "error" };

const TOAST_VISIBLE_MS = 3000;
const TOAST_EXIT_MS = 150; // matches --duration-exit-fast, base.css .toast-exit

// One instance, replace-on-new — a page only ever has one thing to report at
// a time (create/edit/status-change result), so no queue is needed.
export function Toast({
	toast,
	onDismiss,
}: {
	toast: ToastState;
	onDismiss: () => void;
}) {
	const [isClosing, setIsClosing] = useState(false);

	// `toast` isn't read in the body, but the timer must restart whenever a
	// new toast replaces the one currently showing (same component instance,
	// new props) — dropping the dependency would let a fast second toast
	// inherit the first one's already-elapsed timer.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — see comment above.
	useEffect(() => {
		setIsClosing(false);
		const closeTimer = setTimeout(() => setIsClosing(true), TOAST_VISIBLE_MS);
		return () => clearTimeout(closeTimer);
	}, [toast]);

	useEffect(() => {
		if (!isClosing) return;
		const dismissTimer = setTimeout(onDismiss, TOAST_EXIT_MS);
		return () => clearTimeout(dismissTimer);
	}, [isClosing, onDismiss]);

	const Icon = toast.tone === "success" ? CheckCircle2 : AlertCircle;

	return (
		<div
			role="status"
			aria-live="polite"
			className={`fixed inset-x-0 top-6 z-(--z-toast) mx-auto flex w-fit max-w-sm items-center gap-3 rounded-md border bg-surface-elevated px-5 py-3 text-primary shadow-lg ${
				toast.tone === "success" ? "border-success/30" : "border-error/30"
			} ${isClosing ? "toast-exit" : "toast-enter"}`}
		>
			<Icon
				className={`icon-sm shrink-0 ${toast.tone === "success" ? "text-success" : "text-error"}`}
				strokeWidth={1.5}
				aria-hidden="true"
			/>
			<p className="text-sm">{toast.message}</p>
		</div>
	);
}
