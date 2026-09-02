"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Field } from "@/components/form-sheet";
import {
	STATION_DEVICE_ID_COOKIE,
	STATION_DEVICE_TOKEN_TTL_SECONDS,
} from "@/lib/station-session";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc-client";
import { pairingCodePattern } from "@/server/routers/station.schema";

// Gated by layout.tsx (any signed-in session — see there for why). Lives
// outside the four route trees in AGENTS.md on purpose — this authenticates
// a *device*, not a restaurant-scoped viewer, so it's neither /sign-in nor
// under app/restaurants/[restaurantId]. No password is ever typed here
// either way (docs/architecture.md § Station Account Provisioning) — the
// 8-digit pairing code is the only credential this form itself handles.
export default function StationPairPage() {
	const router = useRouter();
	const supabase = createClient();
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const redeemMutation = trpc.station.redeemPairingCode.useMutation();

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!pairingCodePattern.test(code)) {
			setError("Enter the 8-digit code.");
			return;
		}
		setError(null);

		try {
			const { tokenHash, restaurantId, deviceToken } =
				await redeemMutation.mutateAsync({ code });
			const { error: verifyError } = await supabase.auth.verifyOtp({
				token_hash: tokenHash,
				type: "magiclink",
			});
			if (verifyError) {
				setError("Couldn't finish pairing this device.");
				return;
			}
			// A (re)pairing must not inherit whoever was last acting on this
			// device — dineinly_station_session outlives a single shift (12h
			// TTL) and isn't touched by redeeming a new pairing code, so without
			// this the PIN prompt on /floor gets skipped in favor of the
			// previous person's still-valid session. Best-effort: the pairing
			// code is already burned by this point, so a network blip here
			// shouldn't fail the whole flow — worst case a stale session
			// outlives it until Switch User or its own TTL clears it.
			try {
				await fetch("/station/pin", { method: "DELETE" });
			} catch {}
			// One year, path=/ — outlives the Supabase session by design; the
			// value is a signed token (lib/station-session.ts), not a raw id, so
			// requireOwnStaffId can verify it server-side before trusting it for
			// revocation checks. If the station ever re-pairs, a fresh redemption
			// overwrites this with the new device's signed token.
			// biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API isn't supported on every browser this device could be; this write is well-formed and needs no wider surface.
			document.cookie = `${STATION_DEVICE_ID_COOKIE}=${deviceToken}; path=/; max-age=${STATION_DEVICE_TOKEN_TTL_SECONDS}`;
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

			<div className="relative w-full max-w-sm rounded-xl border border-divider bg-surface p-6">
				<button
					type="button"
					onClick={() => router.back()}
					disabled={redeemMutation.isPending}
					aria-label="Close"
					className="icon-tap-target absolute top-4 right-4 rounded-full text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary disabled:cursor-not-allowed disabled:text-muted"
				>
					<X className="icon-md" strokeWidth={1.5} aria-hidden="true" />
				</button>

				<div className="mb-6 text-center">
					<h1 className="text-lg text-primary">Pair this device</h1>
					<p className="mt-1 text-secondary text-sm">
						Enter the 8-digit code shown on the Manager's screen.
					</p>
				</div>

				<form className="space-y-6" onSubmit={handleSubmit} noValidate>
					<Field label="Pairing code" error={error ?? undefined}>
						<input
							inputMode="numeric"
							autoComplete="off"
							maxLength={8}
							placeholder="00000000"
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
						{redeemMutation.isPending ? "Pairing…" : "Pair This Device"}
					</button>
				</form>
			</div>
		</main>
	);
}
