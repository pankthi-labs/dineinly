"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { EXPERIENCE_LABELS } from "@/components/restaurant-fields-fieldset";
import type { AppRouter } from "@/server/routers/_app";
import { needsBillingDetails } from "@/server/routers/restaurants.schema";

type RestaurantListItem =
	inferRouterOutputs<AppRouter>["restaurants"]["list"]["items"][number];

export function RestaurantRow({
	restaurant,
	isExpanded,
	onToggle,
	onEdit,
	onRequestStatusChange,
}: {
	restaurant: RestaurantListItem;
	isExpanded: boolean;
	onToggle: () => void;
	onEdit: () => void;
	onRequestStatusChange: () => void;
}) {
	const regionId = useId();
	const isLive = restaurant.status === "active";
	const dimClass = isLive ? "" : "opacity-60";
	// Null on Menu/Guest, which never ask for a bill address (docs/product.md
	// § Dineinly Experiences).
	const addressLine =
		[restaurant.address, restaurant.city, restaurant.state]
			.filter((part) => part !== null && part !== "")
			.join(", ") || "—";

	return (
		<div className="rounded-xl border border-divider bg-surface transition-colors duration-(--duration-base) ease-out">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={isExpanded}
				aria-controls={regionId}
				className={`flex w-full items-start justify-between gap-4 p-6 text-left ${dimClass}`}
			>
				<div className="flex flex-col gap-1">
					<span
						className={`text-caps ${isLive ? "text-success" : "text-secondary"}`}
					>
						{isLive ? "Live" : "Paused"}
					</span>
					<h3 className="text-lg text-primary">{restaurant.name}</h3>
				</div>
				<ChevronDown
					className={`icon-md shrink-0 text-muted transition-transform duration-(--duration-base) ease-out ${
						isExpanded ? "rotate-180" : ""
					}`}
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			</button>

			{isExpanded ? (
				<section
					id={regionId}
					className="border-divider border-t px-6 pt-6 pb-6"
				>
					<dl
						className={`grid grid-cols-1 gap-6 border-divider border-b pb-6 sm:grid-cols-2 lg:grid-cols-3 ${dimClass}`}
					>
						{restaurant.address || restaurant.city || restaurant.state ? (
							<Detail label="Address" value={addressLine} />
						) : null}
						<Detail
							label="Dineinly Experience"
							value={EXPERIENCE_LABELS[restaurant.experience]}
						/>
						{restaurant.gstNumber ? (
							<Detail label="GST Number" value={restaurant.gstNumber} />
						) : null}
						{restaurant.pincode ? (
							<Detail label="Pincode" value={restaurant.pincode} />
						) : null}
						{needsBillingDetails(restaurant.experience) ? (
							<Detail
								label="Service Charge"
								value={
									restaurant.serviceChargePercent === null
										? "None"
										: `${restaurant.serviceChargePercent}%`
								}
							/>
						) : null}
						<Detail
							label="Owner Name"
							value={restaurant.owner?.name ?? "Not assigned"}
						/>
						{restaurant.owner?.email ? (
							<Detail label="Owner Email" value={restaurant.owner.email} />
						) : null}
						{restaurant.owner?.mobile ? (
							<Detail label="Owner Mobile" value={restaurant.owner.mobile} />
						) : null}
					</dl>

					<div className="flex items-center gap-6 pt-6">
						<Link
							href={`/restaurants/${restaurant.id}`}
							className="text-accent text-caps no-underline hover:opacity-80"
						>
							Open
						</Link>
						<button
							type="button"
							onClick={onEdit}
							className="text-caps text-secondary hover:text-primary"
						>
							Edit
						</button>
						<button
							type="button"
							onClick={onRequestStatusChange}
							className="text-accent-secondary text-caps hover:opacity-80"
						>
							{isLive ? "Pause Restaurant" : "Reactivate Restaurant"}
						</button>
					</div>
				</section>
			) : null}
		</div>
	);
}

function Detail({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-caps text-muted">{label}</dt>
			<dd className="wrap-break-word text-primary text-sm">{value}</dd>
		</div>
	);
}
