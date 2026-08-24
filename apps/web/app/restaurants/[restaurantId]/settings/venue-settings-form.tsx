"use client";

import { type FormEvent, useState } from "react";
import {
	type RestaurantFieldErrors,
	RestaurantFieldsFieldset,
	type RestaurantFieldsValues,
} from "@/components/restaurant-fields-fieldset";
import { restaurantFieldsSchema } from "@/server/routers/restaurants.schema";

export function VenueSettingsForm({
	initialValues,
	onSubmit,
	isSubmitting,
	submitError,
}: {
	initialValues: RestaurantFieldsValues;
	onSubmit: (values: RestaurantFieldsValues) => void;
	isSubmitting: boolean;
	submitError: string | null;
}) {
	const [values, setValues] = useState(initialValues);
	const [errors, setErrors] = useState<RestaurantFieldErrors>({});

	function setField<K extends keyof RestaurantFieldsValues>(
		key: K,
		value: RestaurantFieldsValues[K],
	) {
		setValues((current) => ({ ...current, [key]: value }));
	}

	// Runs on blur so a mistake surfaces as soon as the user leaves the
	// field, not only after they submit the whole form.
	function validateField(key: keyof RestaurantFieldsValues) {
		const result = restaurantFieldsSchema.safeParse(values);
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

		const result = restaurantFieldsSchema.safeParse(values);

		if (!result.success) {
			const fieldErrors: RestaurantFieldErrors = {};
			for (const issue of result.error.issues) {
				const key = issue.path[0] as keyof RestaurantFieldsValues;
				fieldErrors[key] = issue.message;
			}
			setErrors(fieldErrors);
			return;
		}
		setErrors({});
		onSubmit(result.data);
	}

	return (
		<form onSubmit={handleSubmit} noValidate className="space-y-8">
			{submitError ? (
				<p role="alert" className="text-error text-sm">
					{submitError}
				</p>
			) : null}

			<RestaurantFieldsFieldset
				values={values}
				errors={errors}
				setField={setField}
				validateField={validateField}
				showExperienceField={false}
			/>

			<button
				type="submit"
				disabled={isSubmitting}
				aria-busy={isSubmitting}
				className="rounded-md bg-accent px-8 py-4 font-medium text-background text-sm uppercase transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
			>
				{isSubmitting ? "Saving…" : "Save Changes"}
			</button>
		</form>
	);
}
