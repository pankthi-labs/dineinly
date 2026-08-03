"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
	Field,
	FieldGroup,
	FieldRow,
	FormSheet,
	PreferenceFields,
} from "@/components/form-sheet";
import { trpc } from "@/lib/trpc-client";

type MenuCategory = {
	id: string;
	name: string;
	status: "active" | "archived";
};

type FormState = {
	categoryId: string;
	name: string;
	description: string;
	price: string;
	prepTime: string;
	servingSize: string;
	diet: "" | "veg" | "non_veg";
	availability: "available" | "sold_out";
	labels: string;
	spice: "mild" | "regular" | "extra spicy" | null;
	salt: "less salt" | "regular" | null;
	ice: "none" | "less" | "regular" | null;
	status: "active" | "archived";
};

export function AddDishPanel({
	restaurantId,
	categories,
	onClose,
}: {
	restaurantId: string;
	categories: MenuCategory[];
	onClose: () => void;
}) {
	const [form, setForm] = useState<FormState>(() => ({
		categoryId: categories[0]?.id ?? "",
		name: "",
		description: "",
		price: "",
		prepTime: "",
		servingSize: "",
		diet: "",
		availability: "available",
		labels: "",
		spice: null,
		salt: null,
		ice: null,
		status: "active",
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

	function setDisplayStatus(value: "live" | "sold_out" | "hidden") {
		if (value === "live") {
			setForm((current) => ({
				...current,
				availability: "available",
				status: "active",
			}));
			return;
		}
		if (value === "sold_out") {
			setForm((current) => ({
				...current,
				availability: "sold_out",
				status: "active",
			}));
			return;
		}
		setForm((current) => ({ ...current, status: "archived" }));
	}

	function getDisplayStatus() {
		if (form.status === "archived") return "hidden";
		return form.availability === "sold_out" ? "sold_out" : "live";
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);
		const price = Number(form.price);
		const prepTime = Number(form.prepTime);
		if (!form.categoryId) {
			setFormError("Choose a category.");
			return;
		}
		if (!form.diet) {
			setFormError("Choose a dietary type.");
			return;
		}
		if (!Number.isFinite(price) || price < 0) {
			setFormError("Enter a valid non-negative price.");
			return;
		}
		if (!Number.isInteger(prepTime) || prepTime <= 0) {
			setFormError("Preparation time must be a whole number of minutes.");
			return;
		}

		createItem.mutate({
			restaurantId,
			categoryId: form.categoryId,
			name: form.name,
			description: form.description,
			price,
			prepTime,
			servingSize: form.servingSize,
			diet: form.diet,
			availability: form.availability,
			status: form.status,
			labels: form.labels
				.split(",")
				.map((label) => label.trim())
				.filter(Boolean),
			spice: form.spice,
			salt: form.salt,
			ice: form.ice,
		});
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
							value={form.categoryId}
							onChange={(event) => updateForm("categoryId", event.target.value)}
						>
							{categories.map((category) => (
								<option key={category.id} value={category.id}>
									{category.name}
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

					<Field label="Description" required className="resize-y">
						<textarea
							required
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
								value={getDisplayStatus()}
								onChange={(event) =>
									setDisplayStatus(
										event.target.value as "live" | "sold_out" | "hidden",
									)
								}
							>
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
						<Field label="Preparation time (minutes)" required>
							<input
								required
								type="number"
								min="1"
								step="1"
								value={form.prepTime}
								onChange={(event) => updateForm("prepTime", event.target.value)}
							/>
						</Field>
					</FieldRow>

					<Field label="Serving size" required>
						<input
							required
							value={form.servingSize}
							placeholder="e.g. Serves 1"
							onChange={(event) =>
								updateForm("servingSize", event.target.value)
							}
						/>
					</Field>

					<Field label="Labels" hint="Optional. Separate labels with commas.">
						<input
							value={form.labels}
							placeholder="Seasonal, Chef recommended"
							onChange={(event) => updateForm("labels", event.target.value)}
						/>
					</Field>
				</FieldGroup>

				<FieldGroup legend="Preferences">
					<PreferenceFields
						spice={form.spice}
						salt={form.salt}
						ice={form.ice}
						onSpiceChange={(value) => updateForm("spice", value)}
						onSaltChange={(value) => updateForm("salt", value)}
						onIceChange={(value) => updateForm("ice", value)}
					/>
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
