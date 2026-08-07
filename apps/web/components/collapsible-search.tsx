"use client";

import { Search } from "lucide-react";
import { useState } from "react";

/**
 * Search affordance that starts as an icon button, expands into a field on
 * click, and collapses again on blur while still empty. `label` is both the
 * placeholder and the accessible name.
 */
export function CollapsibleSearch({
	value,
	onChange,
	label,
}: {
	value: string;
	onChange: (value: string) => void;
	label: string;
}) {
	const [isOpen, setIsOpen] = useState(false);

	if (!isOpen) {
		return (
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				aria-label={label}
				className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-divider text-secondary transition-colors duration-(--duration-base) ease-out hover:border-accent/40 hover:text-primary"
			>
				<Search className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
			</button>
		);
	}

	return (
		<div className="relative w-full sm:max-w-xs">
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
					if (!value) setIsOpen(false);
				}}
				placeholder={label}
				aria-label={label}
				className="h-12 w-full appearance-none rounded-sm border border-divider bg-surface pr-4 pl-12 text-primary text-sm transition-colors duration-(--duration-base) ease-out placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
			/>
		</div>
	);
}
