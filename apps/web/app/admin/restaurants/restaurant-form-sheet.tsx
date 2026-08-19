"use client";

import { type FormEvent, useState } from "react";
import type { z } from "zod";
import { Field, FieldGroup, FormSheet } from "@/components/form-sheet";
import {
	type PaymentTrack,
	RestaurantFieldsFieldset,
	TRACK_EXPERIENCES,
	trackForExperience,
} from "@/components/restaurant-fields-fieldset";
import {
	ownerContactSchema,
	restaurantFieldsSchema,
} from "@/server/routers/restaurants.schema";

type OwnerContact = z.infer<typeof ownerContactSchema>;

export type RestaurantFormValues = z.infer<typeof restaurantFieldsSchema> &
	OwnerContact;

export type EditTarget = {
	id: string;
	values: RestaurantFormValues;
	ownerStatus: "invited" | "active" | "removed" | null;
};

const EMPTY_OWNER: OwnerContact = {
	ownerName: "",
	ownerEmail: "",
	ownerMobile: "",
};

const EMPTY_VALUES: RestaurantFormValues = {
	name: "",
	address: "",
	city: "",
	gstNumber: "",
	state: "",
	pincode: "",
	serviceChargePercent: null,
	experience: "one",
	...EMPTY_OWNER,
};

type FieldErrors = Partial<Record<keyof RestaurantFormValues, string>>;

const formSchema = restaurantFieldsSchema.merge(ownerContactSchema);

export function RestaurantFormSheet({
	editTarget,
	onClose,
	onCreate,
	onUpdate,
	isSubmitting,
	submitError,
}: {
	/** null = create mode. */
	editTarget: EditTarget | null;
	onClose: () => void;
	onCreate: (values: RestaurantFormValues) => void;
	onUpdate: (id: string, values: RestaurantFormValues) => void;
	isSubmitting: boolean;
	submitError: string | null;
}) {
	const isEdit = editTarget !== null;
	const [values, setValues] = useState<RestaurantFormValues>(
		editTarget?.values ?? EMPTY_VALUES,
	);
	const [track, setTrack] = useState<PaymentTrack>(
		trackForExperience(values.experience),
	);
	const [errors, setErrors] = useState<FieldErrors>({});

	function handleTrackChange(nextTrack: PaymentTrack) {
		setTrack(nextTrack);
		if (!TRACK_EXPERIENCES[nextTrack].includes(values.experience)) {
			setField(
				"experience",
				nextTrack === "full-service" ? "guest" : "counter",
			);
		}
	}

	function setField<K extends keyof RestaurantFormValues>(
		key: K,
		value: RestaurantFormValues[K],
	) {
		setValues((current) => ({ ...current, [key]: value }));
	}

	// Runs on blur so a mistake surfaces as soon as the user leaves the
	// field, not only after they submit the whole form.
	function validateField(key: keyof RestaurantFormValues) {
		const result = formSchema.safeParse(values);
		const issue = result.success
			? undefined
			: result.error.issues.find((i) => i.path[0] === key)?.message;
		setErrors((current) => {
			if (!issue) {
				if (!(key in current)) return current;
				const next = { ...current };
				delete next[key];
				return next;
			}
			return { ...current, [key]: issue };
		});
	}

	// Once the primary owner has signed in once, their details are only
	// changeable via Staff Roster (reassign primary owner) — this sheet
	// doesn't show them at all past that point.
	const ownerLocked = isEdit && editTarget.ownerStatus === "active";

	// Locked owner fields aren't rendered — and may hold null-backed empty
	// values from before the owner ever filled out their own profile.
	// Validating them anyway would silently block submission on fields the
	// admin can no longer see or fix.
	const submitSchema = ownerLocked ? restaurantFieldsSchema : formSchema;

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const result = submitSchema.safeParse(values);

		if (!result.success) {
			const fieldErrors: FieldErrors = {};
			for (const issue of result.error.issues) {
				const key = issue.path[0] as keyof RestaurantFormValues;
				fieldErrors[key] = issue.message;
			}
			setErrors(fieldErrors);
			return;
		}
		setErrors({});

		// When owner fields are locked, result.data is missing them (they
		// aren't in submitSchema) — fall back to the untouched values already
		// loaded from the server for those.
		const payload = { ...values, ...result.data };

		if (!isEdit) {
			onCreate(payload);
			return;
		}

		onUpdate(editTarget.id, payload);
	}

	return (
		<FormSheet
			title={isEdit ? "Edit Restaurant" : "Create Restaurant"}
			onClose={onClose}
			footer={
				<button
					type="submit"
					form="restaurant-form"
					disabled={isSubmitting}
					aria-busy={isSubmitting}
					className="w-full rounded-md bg-accent py-4 font-medium text-background text-sm uppercase transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{isSubmitting
						? "Saving…"
						: isEdit
							? "Save Changes"
							: "Create Restaurant"}
				</button>
			}
		>
			<form
				id="restaurant-form"
				onSubmit={handleSubmit}
				noValidate
				className="space-y-8"
			>
				{submitError ? (
					<p role="alert" className="text-error text-sm">
						{submitError}
					</p>
				) : null}

				<RestaurantFieldsFieldset
					values={values}
					errors={errors}
					// Wrapped, not passed directly: RestaurantFormValues (this file's
					// own values type) is a superset of RestaurantFieldsValues (owner
					// contact fields added), and TS can't prove a generic <K> setter
					// over the superset is assignable to one over the subset. Calling
					// through a plain function lets each concrete key/value pair
					// typecheck individually instead.
					setField={(key, value) => setField(key, value)}
					validateField={validateField}
					track={track}
					onTrackChange={handleTrackChange}
					showTrackSelector={!isEdit}
				/>

				{ownerLocked ? null : (
					<FieldGroup legend="Primary Owner">
						<Field label="Owner name" error={errors.ownerName}>
							<input
								value={values.ownerName}
								onChange={(e) => setField("ownerName", e.target.value)}
								onBlur={() => validateField("ownerName")}
								placeholder="Full name of representative"
							/>
						</Field>
						<Field label="Owner email" error={errors.ownerEmail}>
							<input
								type="email"
								value={values.ownerEmail}
								onChange={(e) => setField("ownerEmail", e.target.value)}
								onBlur={() => validateField("ownerEmail")}
								placeholder="official@email.com"
							/>
						</Field>
						<Field label="Owner mobile" error={errors.ownerMobile}>
							<input
								type="tel"
								value={values.ownerMobile}
								onChange={(e) => setField("ownerMobile", e.target.value)}
								onBlur={() => validateField("ownerMobile")}
								placeholder="+X XX XXXX XXXX"
							/>
						</Field>
					</FieldGroup>
				)}
			</form>
		</FormSheet>
	);
}
