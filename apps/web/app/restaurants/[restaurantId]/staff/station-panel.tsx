"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";

// Owner/Manager only (staff/page.tsx only mounts this for them). Pairing a
// device and revoking one are the two device-level actions from docs/
// architecture.md § Station Account Provisioning; PIN issuance itself
// stays self-service (profile-sheet.tsx), unchanged by this panel.
export function StationPanel({ restaurantId }: { restaurantId: string }) {
	const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(
		null,
	);
	const utils = trpc.useUtils();
	const devicesQuery = trpc.station.listDevices.useQuery({ restaurantId });
	const generateMutation = trpc.station.generatePairingCode.useMutation({
		onSuccess: (data) => setPairing(data),
	});
	const revokeMutation = trpc.station.revokeDevice.useMutation({
		onSuccess: () => utils.station.listDevices.invalidate({ restaurantId }),
	});

	const devices = (devicesQuery.data ?? []).filter((d) => !d.revokedAt);

	return (
		<section className="mt-10 rounded-xl border border-divider bg-surface p-6">
			<div className="flex items-center justify-between">
				<h2 className="text-caps text-muted">Floor Tablets</h2>
				<button
					type="button"
					onClick={() =>
						generateMutation.mutate({ restaurantId, stationType: "waiter" })
					}
					disabled={generateMutation.isPending}
					className="rounded-md bg-accent px-4 py-2 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{generateMutation.isPending ? "Generating…" : "Pair a Floor Tablet"}
				</button>
			</div>

			{pairing ? (
				<div className="mt-4 rounded-md border border-divider bg-surface-elevated p-4 text-center">
					<p className="text-secondary text-sm">
						Enter this code on the tablet at{" "}
						<span className="text-primary">/station/pair</span>:
					</p>
					<p className="mt-2 font-medium text-3xl text-primary tracking-widest">
						{pairing.code}
					</p>
					<p className="mt-1 text-muted text-xs">Expires at {pairing.expiresAt}</p>
					<button
						type="button"
						onClick={() => setPairing(null)}
						className="mt-3 text-secondary text-sm hover:text-primary"
					>
						Dismiss
					</button>
				</div>
			) : null}

			<ul className="mt-4 divide-y divide-divider">
				{devices.length === 0 ? (
					<li className="py-3 text-muted text-sm">No floor tablets paired yet.</li>
				) : (
					devices.map((device) => (
						<li key={device.id} className="flex items-center justify-between py-3">
							<span className="text-primary text-sm">
								Paired {new Date(device.createdAt).toLocaleString()}
							</span>
							<button
								type="button"
								onClick={() => revokeMutation.mutate({ deviceId: device.id })}
								disabled={revokeMutation.isPending}
								className="text-error text-sm hover:opacity-80 disabled:cursor-not-allowed"
							>
								Revoke
							</button>
						</li>
					))
				)}
			</ul>
		</section>
	);
}
