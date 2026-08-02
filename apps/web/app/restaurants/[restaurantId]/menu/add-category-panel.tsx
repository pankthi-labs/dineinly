"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { SideDrawer } from "./side-drawer";

const fieldClassName =
	"w-full rounded-sm border border-divider bg-background px-3 py-3 text-primary text-sm outline-none transition-colors duration-(--duration-base) ease-out focus:border-accent disabled:cursor-not-allowed disabled:text-muted";

export function AddCategoryPanel({
	restaurantId,
	onClose,
}: {
	restaurantId: string;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [taxRate, setTaxRate] = useState("");
	const [formError, setFormError] = useState<string | null>(null);
	const nameInput = useRef<HTMLInputElement>(null);
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
		const parsedTaxRate = Number(taxRate);
		if (
			!Number.isFinite(parsedTaxRate) ||
			parsedTaxRate < 0 ||
			parsedTaxRate > 1
		) {
			setFormError("Enter a tax rate from 0.000 to 1.000.");
			return;
		}

		createCategory.mutate({
			restaurantId,
			name,
			taxRate: parsedTaxRate,
		});
	}

	return (
		<SideDrawer
			title="Add Category"
			titleId="add-category-title"
			onClose={onClose}
			isBusy={createCategory.isPending}
			initialFocusRef={nameInput}
		>
			<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
				<div className="flex-1 overflow-y-auto px-6 py-8">
					<div className="flex flex-col gap-6">
						<Field id="add-category-name" label="Category name" required>
							<input
								id="add-category-name"
								ref={nameInput}
								required
								value={name}
								placeholder="e.g. Signature Cocktails"
								onChange={(event) => setName(event.target.value)}
								className={fieldClassName}
							/>
						</Field>
						<p className="prose -mt-3 text-muted text-sm">
							This will appear on the guest menu.
						</p>
						<Field id="add-category-tax-rate" label="Tax rate" required>
							<input
								id="add-category-tax-rate"
								required
								type="number"
								min="0"
								max="1"
								step="0.001"
								value={taxRate}
								placeholder="e.g. 0.050"
								onChange={(event) => setTaxRate(event.target.value)}
								className={fieldClassName}
							/>
						</Field>
						<p className="prose -mt-3 text-muted text-sm">
							Enter a value from 0.000 to 1.000. For example, 0.050 is 5%.
						</p>
						{formError ? <FormError message={formError} /> : null}
						{createCategory.error ? (
							<FormError message={createCategory.error.message} />
						) : null}
					</div>
				</div>
				<footer className="border-divider border-t bg-surface px-6 py-5">
					<button
						type="submit"
						disabled={createCategory.isPending}
						className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-6 py-4 font-medium text-background text-base transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
					>
						{createCategory.isPending ? (
							<Loader2 aria-hidden="true" className="icon-sm animate-spin" />
						) : null}
						{createCategory.isPending ? "Saving category" : "Save category"}
					</button>
				</footer>
			</form>
		</SideDrawer>
	);
}

function Field({
	id,
	label,
	required = false,
	children,
}: {
	id: string;
	label: string;
	required?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div>
			<label htmlFor={id} className="text-caps text-secondary">
				{label}
				{required ? (
					<span className="ml-1 text-accent-secondary">*</span>
				) : null}
			</label>
			<div className="mt-3">{children}</div>
		</div>
	);
}

function FormError({ message }: { message: string }) {
	return (
		<p
			role="alert"
			className="rounded-sm border border-error bg-surface-elevated p-3 text-error text-sm"
		>
			{message}
		</p>
	);
}
