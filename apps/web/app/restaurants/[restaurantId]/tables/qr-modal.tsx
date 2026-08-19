"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";
import { useDismissableOverlay } from "@/components/use-dismissable-overlay";
import { guestTableUrl } from "@/lib/qr-url";

const COPIED_RESET_MS = 2000;

export function QrModal({
	label,
	qrToken,
	onClose,
	onDownloadPdf,
	isDownloading,
}: {
	label: string;
	qrToken: string;
	onClose: () => void;
	onDownloadPdf: () => void;
	isDownloading: boolean;
}) {
	const [isVisible, setIsVisible] = useState(false);
	const [isCopied, setIsCopied] = useState(false);
	const containerRef = useDismissableOverlay<HTMLDivElement>(true, onClose);
	const url = guestTableUrl(window.location.origin, qrToken);

	useEffect(() => {
		const frame = requestAnimationFrame(() => setIsVisible(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			// Clipboard API unavailable (insecure context, denied permission,
			// unfocused document) — nothing more we can do automatically.
			return;
		}
		setIsCopied(true);
		setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
	}

	return (
		<div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center bg-glass p-4">
			<div
				ref={containerRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="qr-modal-title"
				className={`flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-divider bg-surface-elevated p-8 text-center shadow-lg transition-[opacity,transform] duration-(--duration-deliberate) ease-out ${
					isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
				}`}
			>
				<h2 id="qr-modal-title" className="text-lg text-primary">
					{label}
				</h2>
				{/* QR scanners need dark modules on a light background regardless of theme; bg-white is a scan-reliability requirement, not a themed surface. */}
				<div className="rounded-md bg-white p-4">
					<QRCodeCanvas
						value={url}
						size={220}
						aria-label={`QR code for ${label}`}
						role="img"
					/>
				</div>
				<div className="flex w-full flex-col gap-3">
					<button
						type="button"
						onClick={copyLink}
						className="rounded-md border border-divider px-6 py-3 font-medium text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:bg-surface hover:text-primary"
					>
						{isCopied ? "Copied!" : "Copy Link"}
					</button>
					<button
						type="button"
						onClick={onDownloadPdf}
						disabled={isDownloading}
						aria-busy={isDownloading}
						className="rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
					>
						{isDownloading ? "Preparing…" : "Download PDF"}
					</button>
					<button
						type="button"
						onClick={onClose}
						className="text-caps text-muted hover:text-secondary"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
