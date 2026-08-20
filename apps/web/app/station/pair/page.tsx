"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Field } from "@/components/form-sheet";
import { STATION_DEVICE_ID_COOKIE } from "@/lib/station-session";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import { pairingCodePattern } from "@/server/routers/station.schema";

// Unauthenticated, device-facing (docs/architecture.md § Station Account
// Provisioning, step 2: "no password is ever typed on the device"). Lives
// outside the four route trees in AGENTS.md on purpose — this
// authenticates a device, not a viewer, so it's neither /sign-in nor
// under app/restaurants/[restaurantId], whose layout would redirect an
// unpaired device before it ever reaches this form.
export default function StationPairPage() {
	const router = useRouter();
	const supabase = createClient();
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const redeemMutation = trpc.station.redeemPairingCode.useMutation();

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!pairingCodePattern.test(code)) {
			setError("Enter the 6-digit code.");
			return;
		}
		setError(null);

		try {
			const { tokenHash, restaurantId, deviceId } =
				await redeemMutation.mutateAsync({ code });
			const { error: verifyError } = await supabase.auth.verifyOtp({
				token_hash: tokenHash,
				type: "magiclink",
			});
			if (verifyError) {
				setError("Couldn't finish pairing this device.");
				return;
			}
			// One year, path=/ — outlives the Supabase session by design; if the
			// station ever re-pairs, a fresh redemption overwrites this with the
			// new device's id.
			document.cookie = `${STATION_DEVICE_ID_COOKIE}=${deviceId}; path=/; max-age=${60 * 60 * 24 * 365}`;
			router.replace(`/restaurants/${restaurantId}/floor`);
		} catch (mutationError) {
			setError(
				mutationError instanceof Error
					? mutationError.message
					: "Code not valid.",
			);
		}
	}

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-16">
			<BrandLogo height={40} priority />

			<div className="w-full max-w-sm rounded-xl border border-divider bg-surface p-6">
				<div className="mb-6 text-center">
					<h1 className="text-lg text-primary">Pair this device</h1>
					<p className="mt-1 text-secondary text-sm">
						Enter the 6-digit code shown on the Manager's screen.
					</p>
				</div>

				<form className="space-y-6" onSubmit={handleSubmit} noValidate>
					<Field label="Pairing code" error={error ?? undefined}>
						<input
							inputMode="numeric"
							autoComplete="off"
							maxLength={6}
							placeholder="000000"
							value={code}
							disabled={redeemMutation.isPending}
							onChange={(event) =>
								setCode(event.target.value.replace(/\D/g, ""))
							}
						/>
					</Field>

					<button
						type="submit"
						disabled={redeemMutation.isPending}
						aria-busy={redeemMutation.isPending}
						className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
					>
						{redeemMutation.isPending ? "Pairing…" : "Pair Device"}
					</button>
				</form>
			</div>
		</main>
	);
}
