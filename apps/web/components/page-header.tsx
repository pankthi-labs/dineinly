import type { ReactNode } from "react";

/**
 * Heading + description on the left, actions (each expected to carry its
 * own `shrink-0`) and search on the right, in one `flex-nowrap
 * overflow-x-auto` row — the row scrolls instead of wrapping, so it never
 * breaks onto a second line regardless of button count or viewport width.
 * Same pattern as the nav header's own tab strip.
 */
export function PageHeader({
	search,
	title,
	description,
	actions,
}: {
	search?: ReactNode;
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
			<div>
				<h1 className="text-3xl text-primary lg:text-4xl">{title}</h1>
				{description ? (
					<p className="prose mt-3 text-base text-secondary">{description}</p>
				) : null}
			</div>
			{actions || search ? (
				<div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
					{actions}
					{search}
				</div>
			) : null}
		</header>
	);
}
