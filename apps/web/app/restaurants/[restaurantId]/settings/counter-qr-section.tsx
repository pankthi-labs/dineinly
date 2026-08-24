"use client";

import { useState } from "react";
import type { ToastState } from "@/components/toast";
import { downloadPdf } from "@/lib/download-pdf";
import { trpc } from "@/lib/trpc-client";
import { QrModal } from "../tables/qr-modal";
import { RegenerateConfirmDialog } from "../tables/regenerate-confirm-dialog";

// Dineinly Counter has no Table Matrix either (docs/product.md § Dineinly
// Experiences — zero Restaurant Table rows) — this is the Owner's only QR,
// provisioned automatically (ensure_counter_qr_token,
// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql) the
// moment the restaurant becomes Counter. Unlike Menu's QR, this one never
// joins an existing session on scan — every scan starts a fresh order.
export function CounterQrSection({
	restaurantId,
	onToast,
}: {
	restaurantId: string;
	onToast: (toast: ToastState) => void;
}) {
	const [showQr, setShowQr] = useState(false);
	const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
	const [isDownloading, setIsDownloading] = useState(false);

	const utils = trpc.useUtils();
	const qrQuery = trpc.restaurants.counterQr.get.useQuery({ restaurantId });

	const regenerateMutation = trpc.restaurants.counterQr.regenerate.useMutation({
		onSuccess: () => {
			setShowRegenerateConfirm(false);
			utils.restaurants.counterQr.get.invalidate({ restaurantId });
			onToast({ message: "QR code regenerated.", tone: "success" });
		},
		onError: (error) => {
			setShowRegenerateConfirm(false);
			onToast({ message: error.message, tone: "error" });
		},
	});

	async function handleDownloadPdf() {
		setIsDownloading(true);
		try {
			const result = await utils.restaurants.counterQr.downloadPdf.fetch({
				restaurantId,
				origin: window.location.origin,
			});
			downloadPdf(result.fileName, result.base64);
		} catch (error) {
			onToast({
				message:
					error instanceof Error
						? error.message
						: "Unable to download the QR code.",
				tone: "error",
			});
		} finally {
			setIsDownloading(false);
		}
	}

	if (qrQuery.isPending) {
		return (
			<div className="skeleton mt-8 h-32 max-w-2xl rounded-xl border border-divider" />
		);
	}

	if (!qrQuery.data?.qrToken) return null;

	return (
		<div className="mt-8 max-w-2xl rounded-xl border border-divider bg-surface p-6">
			<h2 className="text-lg text-primary">QR Code</h2>
			<p className="mt-2 text-secondary text-sm">
				One QR for the counter — every scan starts a new order, guests pay with
				the bill number it gives them.
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-caps">
				<button
					type="button"
					onClick={() => setShowQr(true)}
					className="text-accent hover:opacity-80"
				>
					Show QR
				</button>
				<button
					type="button"
					onClick={() => setShowRegenerateConfirm(true)}
					className="text-secondary hover:text-primary"
				>
					Regenerate
				</button>
			</div>

			{showQr ? (
				<QrModal
					label="Counter QR Code"
					qrToken={qrQuery.data.qrToken}
					onClose={() => setShowQr(false)}
					onDownloadPdf={handleDownloadPdf}
					isDownloading={isDownloading}
				/>
			) : null}

			{showRegenerateConfirm ? (
				<RegenerateConfirmDialog
					target={{ id: restaurantId, label: "Counter" }}
					onCancel={() => setShowRegenerateConfirm(false)}
					onConfirm={() => regenerateMutation.mutate({ restaurantId })}
					isPending={regenerateMutation.isPending}
					body="The old printed QR code stops working immediately — anywhere it's posted will need the new one."
				/>
			) : null}
		</div>
	);
}
