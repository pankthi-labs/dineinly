"use client";

import { useState } from "react";
import type { ToastState } from "@/components/toast";
import { downloadPdf } from "@/lib/download-pdf";
import { trpc } from "@/lib/trpc-client";
import { QrModal } from "../tables/qr-modal";
import type { RegenerateTarget } from "../tables/regenerate-confirm-dialog";
import { RegenerateConfirmDialog } from "../tables/regenerate-confirm-dialog";

// Dineinly Menu has no Table Matrix (its package is view-only, no per-table
// anything — docs/product.md § Dineinly Experiences) — this is the Owner's
// only QR, provisioned automatically (ensure_menu_qr_table,
// supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql) the
// moment the restaurant becomes Menu, and reused across the tables.* API
// every other experience's Table Matrix already exercises.
export function QrCodeSection({
	restaurantId,
	onToast,
}: {
	restaurantId: string;
	onToast: (toast: ToastState) => void;
}) {
	const [showQr, setShowQr] = useState(false);
	const [regenerateTarget, setRegenerateTarget] =
		useState<RegenerateTarget | null>(null);
	const [isDownloading, setIsDownloading] = useState(false);

	const utils = trpc.useUtils();
	const listQuery = trpc.tables.list.useQuery({ restaurantId });
	const table = listQuery.data?.[0] ?? null;

	const regenerateMutation = trpc.tables.regenerateQr.useMutation({
		onSuccess: () => {
			setRegenerateTarget(null);
			utils.tables.list.invalidate({ restaurantId });
			onToast({ message: "QR code regenerated.", tone: "success" });
		},
		onError: (error) => {
			setRegenerateTarget(null);
			onToast({ message: error.message, tone: "error" });
		},
	});

	async function handleDownloadPdf() {
		if (!table) return;
		setIsDownloading(true);
		try {
			const result = await utils.tables.downloadQrPdf.fetch({
				id: table.id,
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

	if (listQuery.isPending) {
		return <div className="skeleton h-12 w-64 rounded-md" />;
	}

	if (!table) return null;

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
					onClick={() =>
						setRegenerateTarget({ id: table.id, label: table.label })
					}
					className="rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface hover:text-primary"
				>
					Regenerate QR
				</button>
			</div>

			{showQr ? (
				<QrModal
					label="Menu QR Code"
					qrToken={table.qr_token}
					onClose={() => setShowQr(false)}
					onDownloadPdf={handleDownloadPdf}
					isDownloading={isDownloading}
				/>
			) : null}

			{regenerateTarget ? (
				<RegenerateConfirmDialog
					target={regenerateTarget}
					onCancel={() => setRegenerateTarget(null)}
					onConfirm={() =>
						regenerateMutation.mutate({ id: regenerateTarget.id })
					}
					isPending={regenerateMutation.isPending}
					body="The old printed QR code stops working immediately — anywhere it's posted will need the new one."
				/>
			) : null}
		</>
	);
}
