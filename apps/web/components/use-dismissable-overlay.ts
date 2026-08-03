import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared Escape-to-close + focus-trap + focus-restore behavior for every
// dialog/sheet/dock in the app — no dialog/modal library in this stack
// (design-system.md: semantic HTML only). Focusable elements are re-queried
// on every Tab press rather than snapshotted at mount, so controls that
// appear after open (e.g. a "Reassign" toggle) are included in the trap.
export function useDismissableOverlay<T extends HTMLElement>(
	open: boolean,
	onClose: () => void,
) {
	const containerRef = useRef<T>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);
	// Callers typically pass an inline arrow function, so its identity
	// changes on every render (e.g. every keystroke in the form below). The
	// effect must not re-run on that — only when `open` actually flips —
	// or it steals focus back to the first focusable element on every
	// keystroke. Read the latest callback through a ref instead.
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	useEffect(() => {
		if (!open) return;

		previouslyFocused.current = document.activeElement as HTMLElement | null;
		containerRef.current
			?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0]
			?.focus();

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				onCloseRef.current();
				return;
			}
			if (event.key !== "Tab") return;

			const focusable =
				containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
			if (!focusable || focusable.length === 0) return;

			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!first || !last) return;
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = previousOverflow;
			previouslyFocused.current?.focus();
		};
	}, [open]);

	return containerRef;
}
