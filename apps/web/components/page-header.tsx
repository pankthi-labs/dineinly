import type { ReactNode } from "react";
import { useState } from "react";
import { CollapsibleSearch } from "./collapsible-search";

/**
 * Heading + description on the left, actions (each expected to carry its
 * own `shrink-0`) and search on the right, right-aligned, wrapping onto
 * further lines instead of clipping or forcing a hidden horizontal scroll
 * once there's more in the row than the viewport can hold.
 *
 * Search owns its own open/closed state here (not left to each caller) so
 * every page gets identical behavior: below `md`, actions step aside while
 * search is open so the field can use the full row; at `md` and up there's
 * room for both, so actions stay put.
 */
export function PageHeader({
	search,
	title,
	description,
	actions,
}: {
	search?: { value: string; onChange: (value: string) => void; label: string };
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	const [isSearchOpen, setIsSearchOpen] = useState(false);

	return (
		<header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
			<div className="min-w-0">
				<h1 className="text-3xl text-primary lg:text-4xl">{title}</h1>
				{description ? (
					<p className="prose mt-3 text-base text-secondary">{description}</p>
				) : null}
			</div>
			{actions || search ? (
				<div
					className={`flex flex-wrap items-center justify-end gap-3 ${
						isSearchOpen ? "min-w-0 lg:flex-1" : ""
					}`}
				>
					{actions ? (
						<div className={isSearchOpen ? "hidden md:contents" : "contents"}>
							{actions}
						</div>
					) : null}
					{search ? (
						<CollapsibleSearch
							value={search.value}
							onChange={search.onChange}
							label={search.label}
							onOpenChange={setIsSearchOpen}
						/>
					) : null}
				</div>
			) : null}
		</header>
	);
}
