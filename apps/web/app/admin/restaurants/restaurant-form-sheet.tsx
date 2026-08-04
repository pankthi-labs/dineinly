"use client";

import { type FormEvent, useRef, useState } from "react";
import type { z } from "zod";
import {
	Field,
	FieldGroup,
	FieldRow,
	FormSheet,
} from "@/components/form-sheet";
import {
	adminContactSchema,
	restaurantFieldsSchema,
} from "@/server/routers/restaurants.schema";

type AdminContact = z.infer<typeof adminContactSchema>;

export type RestaurantFormValues = z.infer<typeof restaurantFieldsSchema> &
	AdminContact;

export type EditTarget = {
	id: string;
	values: RestaurantFormValues;
	adminStatus: "invited" | "active" | "removed" | null;
};

const EMPTY_ADMIN: AdminContact = {
	adminName: "",
	adminEmail: "",
	adminMobile: "",
};

const EMPTY_VALUES: RestaurantFormValues = {
	name: "",
	address: "",
	city: "",
	gstNumber: "",
	state: "",
	pincode: "",
	serviceChargePercent: null,
	...EMPTY_ADMIN,
};

type FieldErrors = Partial<Record<keyof RestaurantFormValues, string>>;

const formSchema = restaurantFieldsSchema.merge(adminContactSchema);

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
	/**
	 * `reassignTo` is set only when the admin section is mid-reassignment —
	 * the caller is responsible for running both writes (update, then
	 * reassign) as one unit and only closing/toasting once both succeed.
	 */
	onUpdate: (
		id: string,
		values: RestaurantFormValues,
		reassignTo?: AdminContact,
	) => void;
	isSubmitting: boolean;
	submitError: string | null;
}) {
	const isEdit = editTarget !== null;
	const [values, setValues] = useState<RestaurantFormValues>(
		editTarget?.values ?? EMPTY_VALUES,
	);
	const [errors, setErrors] = useState<FieldErrors>({});
	const [isReassigning, setIsReassigning] = useState(false);
	const originalAdmin = useRef<AdminContact>(
		editTarget
			? {
					adminName: editTarget.values.adminName,
					adminEmail: editTarget.values.adminEmail,
					adminMobile: editTarget.values.adminMobile,
				}
			: EMPTY_ADMIN,
	);

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

	function startReassign() {
		originalAdmin.current = {
			adminName: values.adminName,
			adminEmail: values.adminEmail,
			adminMobile: values.adminMobile,
		};
		setValues((current) => ({ ...current, ...EMPTY_ADMIN }));
		setIsReassigning(true);
	}

	function cancelReassign() {
		setValues((current) => ({ ...current, ...originalAdmin.current }));
		setIsReassigning(false);
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

		if (isReassigning) {
			onUpdate(
				editTarget.id,
				{ ...result.data, ...originalAdmin.current },
				{
					adminName: result.data.adminName,
					adminEmail: result.data.adminEmail,
					adminMobile: result.data.adminMobile,
				},
			);
			return;
		}

		onUpdate(editTarget.id, result.data);
	}

	const emailLocked =
		isEdit && !isReassigning && editTarget.adminStatus === "active";

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

				<FieldGroup
					legend={isReassigning ? "New Primary Admin" : "Primary Admin"}
				>
					{isReassigning ? (
						<p className="px-5 py-4 text-secondary text-sm">
							{originalAdmin.current.adminName} stays an owner with full access,
							just no longer primary.
						</p>
					) : null}

					<Field label="Admin name" error={errors.adminName}>
						<input
							value={values.adminName}
							onChange={(e) => setField("adminName", e.target.value)}
							onBlur={() => validateField("adminName")}
							placeholder="Full name of representative"
						/>
					</Field>
					<Field
						label="Admin email"
						error={errors.adminEmail}
						hint={
							emailLocked
								? "Login email — use Reassign to change the primary admin."
								: undefined
						}
					>
						<input
							type="email"
							value={values.adminEmail}
							onChange={(e) => setField("adminEmail", e.target.value)}
							onBlur={() => validateField("adminEmail")}
							placeholder="official@email.com"
							disabled={emailLocked}
						/>
					</Field>
					<Field label="Admin mobile" error={errors.adminMobile}>
						<input
							type="tel"
							value={values.adminMobile}
							onChange={(e) => setField("adminMobile", e.target.value)}
							onBlur={() => validateField("adminMobile")}
							placeholder="+X XX XXXX XXXX"
						/>
					</Field>

					{isEdit && editTarget.adminStatus === "active" ? (
						<div className="px-5 py-4">
							<button
								type="button"
								onClick={isReassigning ? cancelReassign : startReassign}
								className="text-accent-secondary text-caps hover:opacity-80"
							>
								{isReassigning ? "Cancel Reassign" : "Reassign Primary Admin"}
							</button>
						</div>
					) : null}
				</FieldGroup>
			</form>
		</FormSheet>
	);
}
