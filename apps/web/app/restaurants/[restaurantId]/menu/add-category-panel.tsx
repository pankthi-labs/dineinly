"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Field, FieldGroup, FormSheet } from "@/components/form-sheet";
import { trpc } from "@/lib/trpc-client";

export function AddCategoryPanel({
	restaurantId,
	showTaxField,
	onClose,
}: {
	restaurantId: string;
	/** Only One and Counter have Dineinly compute a bill (docs/product.md §
	 * Dineinly Experiences) — Menu and Guest never reach category tax, so
	 * there's nothing to ask for. */
	showTaxField: boolean;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [taxRate, setTaxRate] = useState("");
	const [formError, setFormError] = useState<string | null>(null);
	const utils = trpc.useUtils();
	const createCategory = trpc.menu.createCategory.useMutation({
		onSuccess: async () => {
			await utils.menu.listForManagement.invalidate({ restaurantId });
			onClose();
		},
	});

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);

		if (!showTaxField) {
			createCategory.mutate({ restaurantId, name, taxRate: null });
			return;
		}

		const parsedTaxRate = Number(taxRate);
		if (
			!Number.isFinite(parsedTaxRate) ||
			parsedTaxRate < 0 ||
			parsedTaxRate > 100
		) {
			setFormError("Enter a tax rate from 0 to 100%.");
			return;
		}

		createCategory.mutate({
			restaurantId,
			name,
			taxRate: parsedTaxRate / 100,
		});
	}

	return (
		<FormSheet
			title="Add Category"
			onClose={onClose}
			footer={
				<button
					type="submit"
					form="add-category-form"
					disabled={createCategory.isPending}
					className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-6 py-4 font-medium text-background text-base transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
				>
					{createCategory.isPending ? (
						<Loader2
							aria-hidden="true"
							className="icon-sm spinner"
							strokeWidth={1.5}
						/>
					) : null}
					{createCategory.isPending ? "Saving category" : "Save category"}
				</button>
			}
		>
			<form
				id="add-category-form"
				onSubmit={handleSubmit}
				className="space-y-6"
			>
				<FieldGroup legend="Category Details">
					<Field
						label="Category name"
						required
						hint="This will appear on the guest menu."
					>
						<input
							required
							value={name}
							placeholder="e.g. Signature Cocktails"
							onChange={(event) => setName(event.target.value)}
						/>
					</Field>
					{showTaxField ? (
						<Field label="Tax rate (%)" required hint="For example, 5 is 5%.">
							<input
								required
								type="number"
								min="0"
								max="100"
								step="0.1"
								value={taxRate}
								placeholder="e.g. 5"
								onChange={(event) => setTaxRate(event.target.value)}
							/>
						</Field>
					) : null}
				</FieldGroup>
				{formError ? (
					<p role="alert" className="text-error text-sm">
						{formError}
					</p>
				) : null}
				{createCategory.error ? (
					<p role="alert" className="text-error text-sm">
						{createCategory.error.message}
					</p>
				) : null}
			</form>
		</FormSheet>
	);
}
