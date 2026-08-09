"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Field, FieldGroup, FormSheet } from "@/components/form-sheet";
import { trpc } from "@/lib/trpc-client";

export function AddLabelPanel({
	restaurantId,
	onClose,
}: {
	restaurantId: string;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const utils = trpc.useUtils();
	const createLabel = trpc.menu.createLabel.useMutation({
		onSuccess: async () => {
			await utils.menu.listForManagement.invalidate({ restaurantId });
			onClose();
		},
	});

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		createLabel.mutate({ restaurantId, name });
	}

	return (
		<FormSheet
			title="Add Label"
			onClose={onClose}
			footer={
				<button
					type="submit"
					form="add-label-form"
					disabled={createLabel.isPending}
					className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-6 py-4 font-medium text-background text-base transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
				>
					{createLabel.isPending ? (
						<Loader2
							aria-hidden="true"
							className="icon-sm spinner"
							strokeWidth={1.5}
						/>
					) : null}
					{createLabel.isPending ? "Saving label" : "Save label"}
				</button>
			}
		>
			<form id="add-label-form" onSubmit={handleSubmit} className="space-y-6">
				<FieldGroup legend="Label Details">
					<Field
						label="Label name"
						required
						hint="Dish forms will offer this as a label choice once saved."
					>
						<input
							required
							value={name}
							placeholder="e.g. Chef Recommended"
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
				</FieldGroup>
				{createLabel.error ? (
					<p role="alert" className="text-error text-sm">
						{createLabel.error.message}
					</p>
				) : null}
			</form>
		</FormSheet>
	);
}
