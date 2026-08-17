"use client";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type AdminListItem =
	inferRouterOutputs<AppRouter>["adminStaff"]["list"][number];

export function AdminRow({
	admin,
	canManageThisRow,
	onEdit,
	onRemove,
}: {
	admin: AdminListItem;
	/** False for the caller's own row (self-removal is blocked server-side
	 * too) and whenever removing this admin would leave zero admins. */
	canManageThisRow: boolean;
	onEdit: () => void;
	onRemove: () => void;
}) {
	return (
		<div className="flex flex-col gap-3 rounded-xl border border-divider bg-surface p-4 transition-colors duration-(--duration-base) ease-out">
			<h3 className="truncate text-lg text-primary">
				{admin.name ?? admin.email}
			</h3>
			<p className="truncate text-secondary text-sm">{admin.email}</p>

			{canManageThisRow ? (
				<div className="mt-1 flex flex-nowrap items-center gap-x-4 overflow-x-auto border-divider border-t pt-3 text-caps">
					<button
						type="button"
						onClick={onEdit}
						aria-label={`Edit ${admin.name ?? admin.email}`}
						className="shrink-0 text-secondary hover:text-primary"
					>
						Edit
					</button>
					<button
						type="button"
						onClick={onRemove}
						aria-label={`Remove ${admin.name ?? admin.email}`}
						className="shrink-0 text-accent-secondary hover:opacity-80"
					>
						Remove
					</button>
				</div>
			) : null}
		</div>
	);
}
