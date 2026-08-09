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
				className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-divider text-secondary transition-colors duration-(--duration-base) ease-out hover:border-accent/40 hover:text-primary"
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
