"use client";

import { type FormEvent, useState } from "react";
import { Field, FieldGroup, FormSheet } from "@/components/form-sheet";
import { adminStaffFieldsSchema } from "@/server/routers/admin-staff.schema";

export type EditTarget = {
	id: string;
	name: string;
};

type FieldErrors = { name?: string; email?: string };

export function AdminFormSheet({
	editTarget,
	onClose,
	onCreate,
	onUpdate,
	isSubmitting,
	submitError,
}: {
	/** null = invite mode. */
	editTarget: EditTarget | null;
	onClose: () => void;
	onCreate: (values: { name: string; email: string }) => void;
	onUpdate: (id: string, name: string) => void;
	isSubmitting: boolean;
	submitError: string | null;
}) {
	const isEdit = editTarget !== null;
	const [name, setName] = useState(editTarget?.name ?? "");
	const [email, setEmail] = useState("");
	const [errors, setErrors] = useState<FieldErrors>({});

	function validateField(key: keyof FieldErrors) {
		const result = adminStaffFieldsSchema.safeParse({ name, email });
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

		if (isEdit) {
			const result = adminStaffFieldsSchema.shape.name.safeParse(name);
			if (!result.success) {
				setErrors({ name: result.error.issues[0]?.message });
				return;
			}
			setErrors({});
			onUpdate(editTarget.id, result.data);
			return;
		}

		const result = adminStaffFieldsSchema.safeParse({ name, email });
		if (!result.success) {
			const fieldErrors: FieldErrors = {};
			for (const issue of result.error.issues) {
				const key = issue.path[0] as keyof FieldErrors;
				fieldErrors[key] = issue.message;
			}
			setErrors(fieldErrors);
			return;
		}
		setErrors({});
		onCreate(result.data);
	}

	return (
		<FormSheet
			title={isEdit ? "Edit Admin" : "Invite Admin"}
			onClose={onClose}
			footer={
				<button
					type="submit"
					form="admin-staff-form"
					disabled={isSubmitting}
					aria-busy={isSubmitting}
					className="w-full rounded-md bg-accent py-4 font-medium text-background text-sm uppercase transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted"
				>
					{isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Invite Admin"}
				</button>
			}
		>
			<form
				id="admin-staff-form"
				onSubmit={handleSubmit}
				noValidate
				className="space-y-8"
			>
				{submitError ? (
					<p role="alert" className="text-error text-sm">
						{submitError}
					</p>
				) : null}

				<FieldGroup legend="Admin Details">
					<Field label="Full name" error={errors.name}>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							onBlur={() => validateField("name")}
							placeholder="e.g. Priya Nair"
						/>
					</Field>
					{isEdit ? null : (
						<Field label="Email address" error={errors.email}>
							<input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								onBlur={() => validateField("email")}
								placeholder="name@dineinly.com"
							/>
						</Field>
					)}
				</FieldGroup>
			</form>
		</FormSheet>
	);
}
