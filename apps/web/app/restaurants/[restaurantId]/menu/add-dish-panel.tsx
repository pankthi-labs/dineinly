"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
	Field,
	FieldGroup,
	FieldRow,
	FormSheet,
	LabelFields,
	PreferenceFields,
} from "@/components/form-sheet";
import { titleCase } from "@/lib/format";
import { firstFormError, menuItemInputSchema } from "@/lib/menu-item-schema";
import {
	PREP_TIME_OPTIONS,
	SERVING_SIZE_LABELS,
	SERVING_SIZE_OPTIONS,
} from "@/lib/menu-options";
import { trpc } from "@/lib/trpc-client";

type MenuCategory = {
	id: string;
	name: string;
	status: "active" | "archived";
};
type MenuLabel = { id: string; name: string };

type DisplayStatus = "" | "live" | "sold_out" | "hidden";

type FormState = {
	categoryId: string;
	name: string;
	description: string;
	price: string;
	prepTime: "" | (typeof PREP_TIME_OPTIONS)[number];
	servingSize: "" | (typeof SERVING_SIZE_OPTIONS)[number];
	diet: "" | "veg" | "non_veg";
	displayStatus: DisplayStatus;
	labels: string[];
	offersSpice: boolean;
	offersSalt: boolean;
	offersIce: boolean;
};

export function AddDishPanel({
	restaurantId,
	categories,
	labels,
	showPreferenceFields,
	onClose,
}: {
	restaurantId: string;
	categories: MenuCategory[];
	labels: MenuLabel[];
	/** False for Dineinly Menu (docs/product.md § Dineinly Experiences) — it
	 * never takes orders, so offering a spice/salt/ice preference has
	 * nothing to apply to. */
	showPreferenceFields: boolean;
	onClose: () => void;
}) {
	const [form, setForm] = useState<FormState>(() => ({
		categoryId: "",
		name: "",
		description: "",
		price: "",
		prepTime: "",
		servingSize: "",
		diet: "",
		displayStatus: "",
		labels: [],
		offersSpice: false,
		offersSalt: false,
		offersIce: false,
	}));
	const [formError, setFormError] = useState<string | null>(null);
	const utils = trpc.useUtils();
	const createItem = trpc.menu.createItem.useMutation({
		onSuccess: async () => {
			await utils.menu.listForManagement.invalidate({ restaurantId });
			onClose();
		},
	});

	function updateForm<Key extends keyof FormState>(
		key: Key,
		value: FormState[Key],
	) {
		setForm((current) => ({ ...current, [key]: value }));
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);
		// displayStatus is a form-only concept (it folds status+availability
		// into one dropdown) — not part of the shared schema, so it's checked
		// separately from the safeParse below.
		if (!form.displayStatus) {
			setFormError("Choose a status.");
			return;
		}

		const parsed = menuItemInputSchema.safeParse({
			restaurantId,
			categoryId: form.categoryId,
			name: form.name,
			description: form.description.trim() || null,
			price: Number(form.price),
			prepTime: form.prepTime,
			servingSize: form.servingSize,
			diet: form.diet,
			availability:
				form.displayStatus === "sold_out" ? "sold_out" : "available",
			status: form.displayStatus === "hidden" ? "archived" : "active",
			labels: form.labels,
			offersSpice: form.offersSpice,
			offersSalt: form.offersSalt,
			offersIce: form.offersIce,
		});
		if (!parsed.success) {
			setFormError(firstFormError(parsed.error));
			return;
		}

		createItem.mutate(parsed.data);
	}

	return (
		<FormSheet
			title="Add Dish"
			onClose={onClose}
			footer={
				<button
					type="submit"
					form="add-dish-form"
					disabled={createItem.isPending}
					className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-6 py-4 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
				>
					{createItem.isPending ? (
						<Loader2
							aria-hidden="true"
							className="icon-sm spinner"
							strokeWidth={1.5}
						/>
					) : null}
					{createItem.isPending ? "Adding dish…" : "Add dish"}
				</button>
			}
		>
			<form id="add-dish-form" onSubmit={handleSubmit} className="space-y-6">
				<FieldGroup legend="Dish Details">
					<Field label="Category" required>
						<select
							required
							value={form.categoryId}
							onChange={(event) => updateForm("categoryId", event.target.value)}
						>
							<option value="" disabled>
								Choose category
							</option>
							{categories.map((category) => (
								<option key={category.id} value={category.id}>
									{titleCase(category.name)}
									{category.status === "archived" ? " (Hidden)" : ""}
								</option>
							))}
						</select>
					</Field>

					<Field label="Dish name" required>
						<input
							required
							value={form.name}
							placeholder="e.g. Pan-Seared Scallops"
							onChange={(event) => updateForm("name", event.target.value)}
						/>
					</Field>

					<Field label="Description" className="resize-y">
						<textarea
							rows={3}
							value={form.description}
							placeholder="Describe the ingredients and preparation."
							onChange={(event) =>
								updateForm("description", event.target.value)
							}
						/>
					</Field>

					<FieldRow>
						<Field label="Price (₹)" required>
							<input
								required
								type="number"
								min="0"
								step="0.01"
								value={form.price}
								onChange={(event) => updateForm("price", event.target.value)}
							/>
						</Field>
						<Field label="Status" required>
							<select
								required
								value={form.displayStatus}
								onChange={(event) =>
									updateForm(
										"displayStatus",
										event.target.value as DisplayStatus,
									)
								}
							>
								<option value="" disabled>
									Choose status
								</option>
								<option value="live">Live</option>
								<option value="sold_out">Sold out</option>
								<option value="hidden">Hidden</option>
							</select>
						</Field>
					</FieldRow>
					<FieldRow>
						<Field label="Dietary type" required>
							<select
								required
								value={form.diet}
								onChange={(event) =>
									updateForm("diet", event.target.value as FormState["diet"])
								}
							>
								<option value="" disabled>
									Choose dietary type
								</option>
								<option value="veg">Vegetarian</option>
								<option value="non_veg">Non-vegetarian</option>
							</select>
						</Field>
						<Field label="Preparation time" required>
							<select
								required
								value={form.prepTime}
								onChange={(event) =>
									updateForm(
										"prepTime",
										event.target.value as FormState["prepTime"],
									)
								}
							>
								<option value="" disabled>
									Choose preparation time
								</option>
								{PREP_TIME_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{titleCase(option)}
									</option>
								))}
							</select>
						</Field>
					</FieldRow>

					<Field label="Serving size" required>
						<select
							required
							value={form.servingSize}
							onChange={(event) =>
								updateForm(
									"servingSize",
									event.target.value as FormState["servingSize"],
								)
							}
						>
							<option value="" disabled>
								Choose serving size
							</option>
							{SERVING_SIZE_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{SERVING_SIZE_LABELS[option]}
								</option>
							))}
						</select>
					</Field>

					<LabelFields
						labels={labels}
						selected={form.labels}
						onChange={(value) => updateForm("labels", value)}
					/>
					{showPreferenceFields ? (
						<PreferenceFields
							offersSpice={form.offersSpice}
							offersSalt={form.offersSalt}
							offersIce={form.offersIce}
							onOffersSpiceChange={(value) => updateForm("offersSpice", value)}
							onOffersSaltChange={(value) => updateForm("offersSalt", value)}
							onOffersIceChange={(value) => updateForm("offersIce", value)}
						/>
					) : null}
				</FieldGroup>

				{formError || createItem.error ? (
					<p role="alert" className="text-error text-sm">
						{formError ?? createItem.error?.message}
					</p>
				) : null}
			</form>
		</FormSheet>
	);
}
