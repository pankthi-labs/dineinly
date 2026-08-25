"use client";

import type { z } from "zod";
import {
	needsBillingDetails,
	type restaurantFieldsSchema,
} from "@/server/routers/restaurants.schema";
import { Field, FieldGroup, FieldRow } from "./form-sheet";

export type RestaurantFieldsValues = z.infer<typeof restaurantFieldsSchema>;
export type RestaurantExperience = RestaurantFieldsValues["experience"];

// docs/product.md § Dineinly Experiences — Menu spans either track; Guest/One
// are Full-Service, Counter is Quick-Service.
export const EXPERIENCE_LABELS: Record<RestaurantExperience, string> = {
	menu: "Dineinly Menu",
	guest: "Dineinly Guest",
	one: "Dineinly One",
	counter: "Dineinly Counter",
};

export type PaymentTrack = "full-service" | "quick-service";

// Menu appears on both tracks (docs/product.md — "view-only, either track");
// Guest/One are Full-Service only, Counter is Quick-Service only.
export const TRACK_EXPERIENCES: Record<PaymentTrack, RestaurantExperience[]> = {
	"full-service": ["menu", "guest", "one"],
	"quick-service": ["menu", "counter"],
};

export function trackForExperience(
	experience: RestaurantExperience,
): PaymentTrack {
	return experience === "counter" ? "quick-service" : "full-service";
}

export type RestaurantFieldErrors = Partial<
	Record<keyof RestaurantFieldsValues, string>
>;

/**
 * The "Dineinly Experience" + "Restaurant Details" field groups shared by
 * the Admin restaurant sheet (app/admin/restaurants) and the owner-facing
 * Venue Settings page (app/restaurants/[restaurantId]/settings) — same
 * fields, same validation, on both sides of restaurantFieldsSchema.
 * Owner-contact fields are never part of this fieldset; each caller renders
 * those separately where they apply.
 */
export function RestaurantFieldsFieldset({
	values,
	errors,
	setField,
	validateField,
	track,
	onTrackChange,
	showTrackSelector = false,
	showExperienceField = true,
}: {
	values: RestaurantFieldsValues;
	errors: RestaurantFieldErrors;
	setField: (
		key: keyof RestaurantFieldsValues,
		value: RestaurantFieldsValues[keyof RestaurantFieldsValues],
	) => void;
	validateField: (key: keyof RestaurantFieldsValues) => void;
	/** Omit to derive from values.experience (trackForExperience) — every
	 * caller that skips this also sets showExperienceField={false}, so
	 * there's no Experience-options list or track selector left to feed. */
	track?: PaymentTrack;
	onTrackChange?: (track: PaymentTrack) => void;
	/** Payment timing (Full-Service/Quick-Service) is only ever chosen at
	 * creation — an existing restaurant only moves within its own track, so
	 * callers editing an existing restaurant should leave this false. */
	showTrackSelector?: boolean;
	/** Dineinly Admin only (Restaurants Directory) — Venue Settings is
	 * self-service and never offers this, only Restaurant Details below. */
	showExperienceField?: boolean;
}) {
	const effectiveTrack = track ?? trackForExperience(values.experience);
	return (
		<>
			{showExperienceField ? (
				<FieldGroup legend="Dineinly Experience">
					{showTrackSelector ? (
						<Field label="Payment timing">
							<select
								value={effectiveTrack}
								onChange={(e) =>
									onTrackChange?.(e.target.value as PaymentTrack)
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
					) : null}
					<Field label="Experience" error={errors.experience}>
						<select
							value={values.experience}
							onChange={(e) =>
								setField(
									"experience",
									e.target.value as RestaurantFieldsValues["experience"],
								)
							}
							onBlur={() => validateField("experience")}
						>
							{TRACK_EXPERIENCES[effectiveTrack].map((experience) => (
								<option key={experience} value={experience}>
									{EXPERIENCE_LABELS[experience]}
								</option>
							))}
						</select>
					</Field>
				</FieldGroup>
			) : null}

			<FieldGroup legend="Restaurant Details">
				<Field label="Restaurant name" error={errors.name}>
					<input
						value={values.name}
						onChange={(e) => setField("name", e.target.value)}
						onBlur={() => validateField("name")}
						placeholder="Enter establishment name"
					/>
				</Field>
				{needsBillingDetails(values.experience) ? (
					<>
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
					</>
				) : null}
			</FieldGroup>
		</>
	);
}
