"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import type { ToastState } from "@/components/toast";
import { Toast } from "@/components/toast";
import { trpc } from "@/lib/trpc-client";
import { RestaurantNavHeader } from "../restaurant-nav-header";
import { useIsCounter } from "../viewer-context";
import { QrCodeSection } from "./qr-code-section";

export default function QrMenuPage() {
	const { restaurantId } = useParams<{ restaurantId: string }>();
	const [toast, setToast] = useState<ToastState | null>(null);
	const isCounter = useIsCounter();
	const restaurantQuery = trpc.restaurants.getById.useQuery({
		id: restaurantId,
	});

	return (
		<div className="min-h-dvh bg-background text-primary">
			<RestaurantNavHeader
				restaurantId={restaurantId}
				restaurantName={restaurantQuery.data?.name ?? ""}
				active="QR Menu"
			/>

			<main className="px-4 pt-8 pb-10 lg:px-16 lg:pt-12 lg:pb-16 xl:px-24">
				<PageHeader
					title="QR Menu"
					description={
						isCounter
							? "One QR for the counter — every scan starts a new order, guests pay with the token number it gives them."
							: "Print it once and place it anywhere — entrance, counter, table tents. Every scan opens your live menu instantly."
					}
				/>

				<div className="mt-8">
					<QrCodeSection
						restaurantId={restaurantId}
						label={isCounter ? "Counter" : "Menu"}
						onToast={setToast}
					/>
				</div>

				<SiteFooter variant="compact" className="mt-16 lg:mt-24" />
			</main>

			{toast ? <Toast toast={toast} onDismiss={() => setToast(null)} /> : null}
		</div>
	);
}
