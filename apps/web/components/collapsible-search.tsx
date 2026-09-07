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
				// A centered 44px hit box (§11's minimum tap target) around a
				// 16px glyph would leave a 14px gap before the page margin.
				// This button is also the trailing item in PageHeader's
				// `overflow-x-auto` actions row, where a negative margin or
				// transform on the box would extend its scrollable overflow
				// past the container and draw a phantom horizontal scrollbar.
				// Right-aligning the glyph inside the box (own utilities, not
				// the shared `icon-tap-target` class and its `justify-center`)
				// keeps the box's own edge flush with the container's — no
				// margin/transform trick needed, so no overflow to produce.
				className="inline-flex min-h-(--icon-tap-target) min-w-(--icon-tap-target) shrink-0 items-center justify-end text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary"
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
				// text-base (16px): iOS Safari auto-zooms the viewport on focus for inputs under 16px.
				className="h-12 w-full appearance-none rounded-sm border border-divider bg-surface pr-4 pl-12 text-base text-primary transition-colors duration-(--duration-base) ease-out placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
			/>
		</div>
	);
}
