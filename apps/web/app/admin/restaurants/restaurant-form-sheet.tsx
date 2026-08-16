"use client";

import { type FormEvent, useState } from "react";
import type { z } from "zod";
import {
	Field,
	FieldGroup,
	FieldRow,
	FormSheet,
} from "@/components/form-sheet";
import {
	ownerContactSchema,
	restaurantFieldsSchema,
} from "@/server/routers/restaurants.schema";

type OwnerContact = z.infer<typeof ownerContactSchema>;

export type RestaurantFormValues = z.infer<typeof restaurantFieldsSchema> &
	OwnerContact;

export type RestaurantExperience = RestaurantFormValues["experience"];

// docs/product.md § Dineinly Experiences — Menu spans either track; Guest/One
// are Full-Service, Counter is Quick-Service.
export const EXPERIENCE_LABELS: Record<RestaurantExperience, string> = {
	menu: "Dineinly Menu",
	guest: "Dineinly Guest",
	one: "Dineinly One",
	counter: "Dineinly Counter",
};

type PaymentTrack = "full-service" | "quick-service";

// Menu appears on both tracks (docs/product.md — "view-only, either track");
// Guest/One are Full-Service only, Counter is Quick-Service only.
const TRACK_EXPERIENCES: Record<PaymentTrack, RestaurantExperience[]> = {
	"full-service": ["menu", "guest", "one"],
	"quick-service": ["menu", "counter"],
};

function trackForExperience(experience: RestaurantExperience): PaymentTrack {
	return experience === "counter" ? "quick-service" : "full-service";
}

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

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		const result = formSchema.safeParse(values);

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

		if (!isEdit) {
			onCreate(result.data);
			return;
		}

		onUpdate(editTarget.id, result.data);
	}

	// Once the primary owner has signed in once, their details are only
	// changeable via Staff Roster (reassign primary owner) — this sheet
	// doesn't show them at all past that point.
	const ownerLocked = isEdit && editTarget.ownerStatus === "active";

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

				<FieldGroup legend="Dineinly Experience">
					{isEdit ? null : (
						<Field label="Payment timing">
							<select
								value={track}
								onChange={(e) =>
									handleTrackChange(e.target.value as PaymentTrack)
								}
							>
								<option value="full-service">
									Pay after the meal (Full-Service)
								</option>
								<option value="quick-service">
									Pay before the meal (Quick-Service)
								</option>
							</select>
						</Field>
					)}
					<Field label="Experience" error={errors.experience}>
						<select
							value={values.experience}
							onChange={(e) =>
								setField(
									"experience",
									e.target.value as RestaurantFormValues["experience"],
								)
							}
							onBlur={() => validateField("experience")}
						>
							{TRACK_EXPERIENCES[track].map((experience) => (
								<option key={experience} value={experience}>
									{EXPERIENCE_LABELS[experience]}
								</option>
							))}
						</select>
					</Field>
				</FieldGroup>

				<FieldGroup legend="Restaurant Details">
					<Field label="Restaurant name" error={errors.name}>
						<input
							value={values.name}
							onChange={(e) => setField("name", e.target.value)}
							onBlur={() => validateField("name")}
							placeholder="Enter establishment name"
						/>
					</Field>
					<Field label="Address" error={errors.address}>
						<input
							value={values.address}
							onChange={(e) => setField("address", e.target.value)}
							onBlur={() => validateField("address")}
							placeholder="Street, area"
						/>
					</Field>
					<FieldRow columns={3}>
						<Field label="City" error={errors.city}>
							<input
								value={values.city}
								onChange={(e) => setField("city", e.target.value)}
								onBlur={() => validateField("city")}
								placeholder="e.g. Mumbai"
							/>
						</Field>
						<Field label="State" error={errors.state}>
							<input
								value={values.state}
								onChange={(e) => setField("state", e.target.value)}
								onBlur={() => validateField("state")}
								placeholder="e.g. Maharashtra"
							/>
						</Field>
						<Field label="Pincode" error={errors.pincode}>
							<input
								value={values.pincode}
								onChange={(e) => setField("pincode", e.target.value)}
								onBlur={() => validateField("pincode")}
								placeholder="6-digit code"
								inputMode="numeric"
							/>
						</Field>
					</FieldRow>
					<Field label="GST number" error={errors.gstNumber}>
						<input
							value={values.gstNumber}
							onChange={(e) =>
								setField("gstNumber", e.target.value.toUpperCase())
							}
							onBlur={() => validateField("gstNumber")}
							placeholder="15-character GSTIN"
						/>
					</Field>
					<Field
						label="Service charge (optional)"
						error={errors.serviceChargePercent}
					>
						<input
							value={values.serviceChargePercent ?? ""}
							onChange={(e) =>
								setField(
									"serviceChargePercent",
									e.target.value === "" ? null : Number(e.target.value),
								)
							}
							onBlur={() => validateField("serviceChargePercent")}
							placeholder="e.g. 5"
							inputMode="decimal"
						/>
					</Field>
				</FieldGroup>

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
