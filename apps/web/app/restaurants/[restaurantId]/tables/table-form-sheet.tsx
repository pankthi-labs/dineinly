"use client";

import { type FormEvent, useState } from "react";
import type { z } from "zod";
import { Field, FieldGroup, FormSheet } from "@/components/form-sheet";
import { tableFieldsSchema } from "@/server/routers/tables.schema";

export type TableFormValues = z.infer<typeof tableFieldsSchema>;

export type EditTarget = {
	id: string;
	values: TableFormValues;
};

const EMPTY_VALUES: TableFormValues = { label: "" };

type FieldErrors = Partial<Record<keyof TableFormValues, string>>;

export function TableFormSheet({
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
	onCreate: (values: TableFormValues) => void;
	onUpdate: (id: string, values: TableFormValues) => void;
	isSubmitting: boolean;
	submitError: string | null;
}) {
	const isEdit = editTarget !== null;
	const [values, setValues] = useState<TableFormValues>(
		editTarget?.values ?? EMPTY_VALUES,
	);
	const [errors, setErrors] = useState<FieldErrors>({});

	function setField<K extends keyof TableFormValues>(
		key: K,
		value: TableFormValues[K],
	) {
		setValues((current) => ({ ...current, [key]: value }));
	}

	function validateField(key: keyof TableFormValues) {
		const result = tableFieldsSchema.safeParse(values);
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

		const result = tableFieldsSchema.safeParse(values);

		if (!result.success) {
			const fieldErrors: FieldErrors = {};
			for (const issue of result.error.issues) {
				const key = issue.path[0] as keyof TableFormValues;
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
			title={isEdit ? "Edit Table" : "Create Table"}
			onClose={onClose}
			footer={
				<button
					type="submit"
					form="table-form"
					disabled={isSubmitting}
					aria-busy={isSubmitting}
					className="w-full rounded-md bg-accent py-4 font-medium text-background text-sm uppercase transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Create Table"}
				</button>
			}
		>
			<form
				id="table-form"
				onSubmit={handleSubmit}
				noValidate
				className="space-y-8"
			>
				{submitError ? (
					<p role="alert" className="text-error text-sm">
						{submitError}
					</p>
				) : null}

				<FieldGroup legend="Table Details">
					<Field label="Table label" error={errors.label}>
						<input
							value={values.label}
							onChange={(e) => setField("label", e.target.value)}
							onBlur={() => validateField("label")}
							placeholder="e.g. Table 5"
						/>
					</Field>
				</FieldGroup>
			</form>
		</FormSheet>
	);
}
