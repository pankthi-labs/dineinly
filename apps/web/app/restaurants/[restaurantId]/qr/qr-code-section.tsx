"use client";

import { useState } from "react";
import type { ToastState } from "@/components/toast";
import { downloadPdf } from "@/lib/download-pdf";
import { trpc } from "@/lib/trpc-client";
import { QrModal } from "../tables/qr-modal";
import { RegenerateConfirmDialog } from "../tables/regenerate-confirm-dialog";

// Dineinly Menu has no Table Matrix (its package is view-only, no per-table
// anything — docs/product.md § Dineinly Experiences) — this is the Owner's
// only QR, provisioned automatically (ensure_menu_qr_token,
// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql) the
// moment the restaurant becomes Menu. A restaurant-level token, same shape
// as Counter's — not a table, so regenerating it never hits an
// "occupied" check: there's no session here a staff member ever closes.
export function QrCodeSection({
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
	const qrQuery = trpc.restaurants.menuQr.get.useQuery({ restaurantId });

	const regenerateMutation = trpc.restaurants.menuQr.regenerate.useMutation({
		onSuccess: () => {
			setShowRegenerateConfirm(false);
			utils.restaurants.menuQr.get.invalidate({ restaurantId });
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
			const result = await utils.restaurants.menuQr.downloadPdf.fetch({
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
		return <div className="skeleton h-12 w-64 rounded-md" />;
	}

	if (!qrQuery.data?.qrToken) return null;

	return (
		<>
			<div className="flex flex-wrap gap-4">
				<button
					type="button"
					onClick={() => setShowQr(true)}
					className="rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover"
				>
					Show QR
				</button>
				<button
					type="button"
					onClick={() => setShowRegenerateConfirm(true)}
					className="rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface hover:text-primary"
				>
					Regenerate QR
				</button>
			</div>

			{showQr ? (
				<QrModal
					label="Menu QR Code"
					qrToken={qrQuery.data.qrToken}
					onClose={() => setShowQr(false)}
					onDownloadPdf={handleDownloadPdf}
					isDownloading={isDownloading}
				/>
			) : null}

			{showRegenerateConfirm ? (
				<RegenerateConfirmDialog
					target={{ id: restaurantId, label: "Menu" }}
					onCancel={() => setShowRegenerateConfirm(false)}
					onConfirm={() => regenerateMutation.mutate({ restaurantId })}
					isPending={regenerateMutation.isPending}
					body="The old printed QR code stops working immediately — anywhere it's posted will need the new one."
				/>
			) : null}
		</>
	);
}
