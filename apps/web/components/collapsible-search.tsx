"use client";

import { Search } from "lucide-react";
import { useState } from "react";

/**
 * Search affordance that starts as an icon button, expands into a field on
 * click, and collapses again on blur while still empty. `label` is both the
 * placeholder and the accessible name. `onOpenChange` lets a cramped caller
 * (e.g. a mobile header sharing the row with a title) hide its other content
 * while the field is open instead of squeezing it.
 */
export function CollapsibleSearch({
	value,
	onChange,
	label,
	onOpenChange,
}: {
	value: string;
	onChange: (value: string) => void;
	label: string;
	onOpenChange?: (open: boolean) => void;
}) {
	const [isOpen, setIsOpen] = useState(false);

	function open() {
		setIsOpen(true);
		onOpenChange?.(true);
	}

	function close() {
		setIsOpen(false);
		onOpenChange?.(false);
	}

	if (!isOpen) {
		return (
			<button
				type="button"
				onClick={open}
				aria-label={label}
				// icon-tap-target's 44px hit box is bigger than the 16px glyph it
				// wraps (§11's minimum tap target) — without a visible border to
				// justify that padding (removed above), the box's true right edge
				// reads as a stray gap before the page margin. Negative margin
				// pulls the glyph flush to the same edge as the text above/below
				// it while keeping the full tap area (it just extends inward).
				// -mr-4, not the exact 14px half-difference, because globals.css's
				// 8px grid has no registered step between 12px and 16px.
				className="icon-tap-target -mr-4 shrink-0 text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary"
			>
				<Search className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
			</button>
		);
	}

	return (
		<div className="relative min-w-0 flex-1">
			<Search
				className="icon-sm pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
				strokeWidth={1.5}
				aria-hidden="true"
			/>
			<input
				type="search"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onBlur={() => {
					if (!value) close();
				}}
				placeholder={label}
				aria-label={label}
				// biome-ignore lint/a11y/noAutofocus: triggered by the user's own click on the search button, not on page load — the field they just opened is the obvious next focus target.
				autoFocus
				className="h-12 w-full appearance-none rounded-sm border border-divider bg-surface pr-4 pl-12 text-primary text-sm transition-colors duration-(--duration-base) ease-out placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
			/>
		</div>
	);
}
