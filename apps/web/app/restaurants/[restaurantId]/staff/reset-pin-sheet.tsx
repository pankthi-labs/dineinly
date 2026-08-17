"use client";

import { type FormEvent, useState } from "react";
import { Field, FieldGroup, FormSheet } from "@/components/form-sheet";
import { PIN_PATTERN } from "@/server/routers/staff.schema";

export type ResetPinTarget = {
	id: string;
	name: string;
};

// Dineinly Admin override (Tbd.md "PIN station login" — no self-service
// recovery exists, since a PIN is never tied to an inbox). Distinct from
// the self-service PIN field in ProfileSheet — this one names a target
// staff member and calls admin_reset_staff_pin, not set_staff_pin.
export function ResetPinSheet({
	target,
	onClose,
	onSubmit,
	isSubmitting,
	submitError,
}: {
	target: ResetPinTarget;
	onClose: () => void;
	onSubmit: (pin: string) => void;
	isSubmitting: boolean;
	submitError: string | null;
}) {
	const [pin, setPin] = useState("");
	const [error, setError] = useState<string | null>(null);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!PIN_PATTERN.test(pin)) {
			setError("PIN must be 4 to 6 digits.");
			return;
		}
		setError(null);
		onSubmit(pin);
	}

	return (
		<FormSheet
			title={`Reset ${target.name}'s PIN`}
			onClose={onClose}
			isSubmitting={isSubmitting}
			footer={
				<button
					type="submit"
					form="reset-pin-form"
					disabled={isSubmitting}
					aria-busy={isSubmitting}
					className="w-full rounded-md bg-accent py-4 font-medium text-background text-sm uppercase transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{isSubmitting ? "Saving…" : "Reset PIN"}
				</button>
			}
		>
			<form
				id="reset-pin-form"
				onSubmit={handleSubmit}
				noValidate
				className="space-y-8"
			>
				{error || submitError ? (
					<p role="alert" className="text-error text-sm">
						{error ?? submitError}
					</p>
				) : null}

				<FieldGroup legend="New PIN">
					<Field
						label="PIN"
						hint="4 to 6 digits. Takes effect immediately — the previous PIN stops working."
					>
						<input
							type="password"
							inputMode="numeric"
							autoComplete="off"
							value={pin}
							onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
							maxLength={6}
							placeholder="••••"
						/>
					</Field>
				</FieldGroup>
			</form>
		</FormSheet>
	);
}
