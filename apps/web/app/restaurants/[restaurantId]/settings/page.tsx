"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import { trpc } from "@/lib/trpc-client";
import { RestaurantNavHeader } from "../restaurant-nav-header";
import { VenueSettingsForm } from "./venue-settings-form";

export default function VenueSettingsPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const [toast, setToast] = useState<ToastState | null>(null);

	const utils = trpc.useUtils();
	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});
	const settingsQuery = trpc.restaurants.getSettings.useQuery({
		id: restaurantId,
	});

	const updateMutation = trpc.restaurants.updateOwn.useMutation({
		onSuccess: () => {
			utils.restaurants.getSettings.invalidate({ id: restaurantId });
			utils.restaurants.getById.invalidate({ id: restaurantId });
			setToast({ message: "Venue settings saved.", tone: "success" });
		},
	});

	return (
		<div className="min-h-dvh bg-background text-primary">
			<RestaurantNavHeader
				restaurantId={restaurantId}
				restaurantName={restaurantQuery.data?.name ?? ""}
				active="Venue Settings"
			/>

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<PageHeader
					title="Venue Settings"
					description="Restaurant details, Dineinly experience, and service charge."
				/>

				<div className="mt-8 max-w-2xl">
					{settingsQuery.isPending ? (
						<div className="space-y-4">
							{Array.from({ length: 4 }, (_, i) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders never reorder.
									key={i}
									className="skeleton h-16 rounded-xl border border-divider"
								/>
							))}
						</div>
					) : settingsQuery.isError ? (
						<div className="rounded-xl border border-divider bg-surface p-8 text-center">
							<p role="alert" className="text-error text-sm">
								Couldn't load venue settings: {settingsQuery.error.message}
							</p>
							<button
								type="button"
								onClick={() => settingsQuery.refetch()}
								className="mt-4 text-accent text-caps hover:opacity-80"
							>
								Retry
							</button>
						</div>
					) : (
						<VenueSettingsForm
							key={settingsQuery.data.id}
							initialValues={settingsQuery.data}
							onSubmit={(values) =>
								updateMutation.mutate({ id: restaurantId, ...values })
							}
							isSubmitting={updateMutation.isPending}
							submitError={updateMutation.error?.message ?? null}
						/>
					)}
				</div>
			</main>

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}
