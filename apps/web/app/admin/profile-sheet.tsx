"use client";

import { type FormEvent, useState } from "react";
import { Field, FieldGroup, FormSheet } from "@/components/form-sheet";
import { trpc } from "@/lib/trpc-client";
import { PIN_PATTERN } from "@/server/routers/staff.schema";

// Every active staff role's self-service surface — edit their own name, set/
// change their own attribution PIN. Reachable from the header "Profile"
// action regardless of what else a role can manage (Waiter/Kitchen can't
// reach Staff Roster at all, so this is their only route to either field).
// Two independent mutations: name always saves if changed, PIN only if the
// field is non-empty — leaving it blank means "don't change my PIN".
//
// Dineinly Admin has no Staff row anywhere, so `restaurantId` is omitted for
// them — name-only, backed by auth.updateDisplayName instead of the
// staff-scoped mutations, and no PIN section (nothing to attribute on a
// shared kitchen/floor device for an Admin identity).
export function ProfileSheet({
	restaurantId,
	name,
	hasPin,
	onClose,
}: {
	restaurantId?: string;
	name: string;
	hasPin: boolean;
	onClose: () => void;
}) {
	const [nameValue, setNameValue] = useState(name);
	const [pin, setPin] = useState("");
	const [error, setError] = useState<string | null>(null);
	const utils = trpc.useUtils();

	const updateOwnProfileMutation = trpc.staff.updateOwnProfile.useMutation();
	const updateDisplayNameMutation = trpc.auth.updateDisplayName.useMutation();
	const setPinMutation = trpc.staff.setPin.useMutation();
	const isSubmitting =
		updateOwnProfileMutation.isPending ||
		updateDisplayNameMutation.isPending ||
		setPinMutation.isPending;

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const trimmedName = nameValue.trim();
		if (trimmedName.length < 2) {
			setError("Name must be at least 2 characters.");
			return;
		}
		if (restaurantId && pin && !PIN_PATTERN.test(pin)) {
			setError("PIN must be 4 to 6 digits.");
			return;
		}
		setError(null);

		try {
			if (trimmedName !== name) {
				if (restaurantId) {
					await updateOwnProfileMutation.mutateAsync({
						restaurantId,
						name: trimmedName,
					});
				} else {
					await updateDisplayNameMutation.mutateAsync({ name: trimmedName });
				}
			}
			if (restaurantId) {
				if (pin) {
					await setPinMutation.mutateAsync({ restaurantId, pin });
				}
				utils.staff.myProfile.invalidate({ restaurantId });
				utils.staff.list.invalidate({ restaurantId });
			} else {
				utils.auth.me.invalidate();
			}
			onClose();
		} catch (mutationError) {
			setError(
				mutationError instanceof Error
					? mutationError.message
					: "Unable to save your profile.",
			);
		}
	}

	return (
		<FormSheet
			title="Profile"
			onClose={onClose}
			isSubmitting={isSubmitting}
			footer={
				<button
					type="submit"
					form="profile-form"
					disabled={isSubmitting}
					aria-busy={isSubmitting}
					className="w-full rounded-md bg-accent py-4 font-medium text-background text-sm uppercase transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{isSubmitting ? "Saving…" : "Save Changes"}
				</button>
			}
		>
			<form
				id="profile-form"
				onSubmit={handleSubmit}
				noValidate
				className="space-y-8"
			>
				{error ? (
					<p role="alert" className="text-error text-sm">
						{error}
					</p>
				) : null}

				<FieldGroup legend="Name">
					<Field label="Full name">
						<input
							value={nameValue}
							onChange={(e) => setNameValue(e.target.value)}
							placeholder="e.g. Priya Nair"
						/>
					</Field>
				</FieldGroup>

				{restaurantId ? (
					<FieldGroup legend="Attribution PIN">
						<Field
							label={hasPin ? "New PIN" : "PIN"}
							hint="4 to 6 digits. Identifies you on shared kitchen/floor devices — never your sign-in password. Leave blank to keep your current PIN."
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
				) : null}
			</form>
		</FormSheet>
	);
}
