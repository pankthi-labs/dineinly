"use client";

import { type FormEvent, useState } from "react";
import type { z } from "zod";
import { Field, FieldGroup, FormSheet } from "@/components/form-sheet";
import type { StaffRole } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";
import { staffFieldsSchema } from "@/server/routers/staff.schema";

export type StaffFormValues = z.infer<typeof staffFieldsSchema>;

export type EditTarget = {
	id: string;
	values: StaffFormValues;
	status: "invited" | "active" | "removed";
};

const EMPTY_VALUES: StaffFormValues = {
	name: "",
	email: "",
	role: "waiter",
};

type FieldErrors = Partial<Record<keyof StaffFormValues, string>>;

export function StaffFormSheet({
	editTarget,
	availableRoles,
	onClose,
	onCreate,
	onUpdate,
	isSubmitting,
	submitError,
}: {
	/** null = invite mode. */
	editTarget: EditTarget | null;
	/** The caller's own role narrows this — a Manager never gets "owner"
	 * offered (docs/product.md § RBAC: "Managers may not invite Owners"). */
	availableRoles: StaffRole[];
	onClose: () => void;
	onCreate: (values: StaffFormValues) => void;
	onUpdate: (id: string, values: StaffFormValues) => void;
	isSubmitting: boolean;
	submitError: string | null;
}) {
	const isEdit = editTarget !== null;
	const [values, setValues] = useState<StaffFormValues>(
		editTarget?.values ?? EMPTY_VALUES,
	);
	const [errors, setErrors] = useState<FieldErrors>({});

	// Once linked (signed in at least once), the account's real identity is
	// auth.uid(), not this field — update_staff (supabase/migrations/
	// 20260816164344_add_staff_roster_rpcs.sql) silently ignores an email
	// edit past that point, so the field is locked here to match rather than
	// let staff type a change that quietly never saves.
	const emailLocked = isEdit && editTarget.status === "active";

	function setField<K extends keyof StaffFormValues>(
		key: K,
		value: StaffFormValues[K],
	) {
		setValues((current) => ({ ...current, [key]: value }));
	}

	function validateField(key: keyof StaffFormValues) {
		const result = staffFieldsSchema.safeParse(values);
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

		const result = staffFieldsSchema.safeParse(values);

		if (!result.success) {
			const fieldErrors: FieldErrors = {};
			for (const issue of result.error.issues) {
				const key = issue.path[0] as keyof StaffFormValues;
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

	return (
		<FormSheet
			title={isEdit ? "Edit Staff" : "Add Staff"}
			onClose={onClose}
			footer={
				<button
					type="submit"
					form="staff-form"
					disabled={isSubmitting}
					aria-busy={isSubmitting}
					className="w-full rounded-md bg-accent py-4 font-medium text-background text-sm uppercase transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Invite Staff"}
				</button>
			}
		>
			<form
				id="staff-form"
				onSubmit={handleSubmit}
				noValidate
				className="space-y-8"
			>
				{submitError ? (
					<p role="alert" className="text-error text-sm">
						{submitError}
					</p>
				) : null}

				<FieldGroup legend="Staff Details">
					<Field label="Full name" error={errors.name}>
						<input
							value={values.name}
							onChange={(e) => setField("name", e.target.value)}
							onBlur={() => validateField("name")}
							placeholder="e.g. Priya Nair"
						/>
					</Field>
					<Field
						label="Email address"
						error={errors.email}
						hint={
							emailLocked ? "Locked once this person has signed in." : undefined
						}
					>
						<input
							type="email"
							value={values.email}
							disabled={emailLocked}
							onChange={(e) => setField("email", e.target.value)}
							onBlur={() => validateField("email")}
							placeholder="name@restaurant.com"
						/>
					</Field>
					<Field label="Role" error={errors.role}>
						<select
							value={values.role}
							onChange={(e) => setField("role", e.target.value as StaffRole)}
							onBlur={() => validateField("role")}
						>
							{availableRoles.map((role) => (
								<option key={role} value={role}>
									{ROLE_LABEL[role]}
								</option>
							))}
						</select>
					</Field>
				</FieldGroup>
			</form>
		</FormSheet>
	);
}
