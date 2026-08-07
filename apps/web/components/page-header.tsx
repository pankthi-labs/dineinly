import type { ReactNode } from "react";

/**
 * Two-row page header: breadcrumb + optional search on row one, heading +
 * description + primary actions on row two — so search and actions never
 * compete for width.
 */
export function PageHeader({
	breadcrumb,
	search,
	title,
	description,
	actions,
}: {
	breadcrumb: ReactNode;
	search?: ReactNode;
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<header>
			<div className="flex items-center gap-4">
				{breadcrumb}
				{search ? <div className="ml-auto">{search}</div> : null}
			</div>
			<div className="mt-4 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<h1 className="text-3xl text-primary lg:text-4xl">{title}</h1>
					{description ? (
						<p className="prose mt-3 text-base text-secondary">{description}</p>
					) : null}
				</div>
				{actions ? (
					<div className="flex flex-wrap items-center gap-3">{actions}</div>
				) : null}
			</div>
		</header>
	);
}
