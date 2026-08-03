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

type EditableMenuItem = {
	id: string;
	category_id: string;
	name: string;
	description: string;
	price: number;
	prep_time: number;
	serving_size: string;
	diet: "veg" | "non_veg";
	availability: "available" | "sold_out";
	labels: string[];
	spice: "mild" | "regular" | "extra spicy" | null;
	salt: "less salt" | "regular" | null;
	ice: "none" | "less" | "regular" | null;
	status: "active" | "archived";
};

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
	diet: EditableMenuItem["diet"];
	availability: EditableMenuItem["availability"];
	labels: string;
	spice: EditableMenuItem["spice"];
	salt: EditableMenuItem["salt"];
	ice: EditableMenuItem["ice"];
	status: EditableMenuItem["status"];
};

function toFormState(item: EditableMenuItem): FormState {
	return {
		categoryId: item.category_id,
		name: item.name,
		description: item.description,
		price: String(item.price),
		prepTime: String(item.prep_time),
		servingSize: item.serving_size,
		diet: item.diet,
		availability: item.availability,
		labels: item.labels.join(", "),
		spice: item.spice,
		salt: item.salt,
		ice: item.ice,
		status: item.status,
	};
}

export function EditDishPanel({
	restaurantId,
	item,
	categories,
	onClose,
}: {
	restaurantId: string;
	item: EditableMenuItem;
	categories: MenuCategory[];
	onClose: () => void;
}) {
	const [form, setForm] = useState<FormState>(() => toFormState(item));
	const [formError, setFormError] = useState<string | null>(null);
	const utils = trpc.useUtils();
	const updateItem = trpc.menu.updateItem.useMutation({
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
				status: "active",
				availability: "available",
			}));
			return;
		}
		if (value === "sold_out") {
			setForm((current) => ({
				...current,
				status: "active",
				availability: "sold_out",
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
		if (!Number.isFinite(price) || price < 0) {
			setFormError("Enter a valid non-negative price.");
			return;
		}
		if (!Number.isInteger(prepTime) || prepTime <= 0) {
			setFormError("Preparation time must be a whole number of minutes.");
			return;
		}

		updateItem.mutate({
			restaurantId,
			itemId: item.id,
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
			title="Edit Dish"
			onClose={onClose}
			footer={
				<button
					type="submit"
					form="edit-dish-form"
					disabled={updateItem.isPending}
					className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-6 py-4 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
				>
					{updateItem.isPending ? (
						<Loader2
							aria-hidden="true"
							className="icon-sm spinner"
							strokeWidth={1.5}
						/>
					) : null}
					{updateItem.isPending ? "Saving changes…" : "Save changes"}
				</button>
			}
		>
			<form id="edit-dish-form" onSubmit={handleSubmit} className="space-y-6">
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
							onChange={(event) => updateForm("name", event.target.value)}
						/>
					</Field>

					<Field label="Description" required className="resize-y">
						<textarea
							required
							rows={3}
							value={form.description}
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
								value={form.diet}
								onChange={(event) =>
									updateForm("diet", event.target.value as FormState["diet"])
								}
							>
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
							onChange={(event) =>
								updateForm("servingSize", event.target.value)
							}
						/>
					</Field>

					<Field label="Labels" hint="Separate labels with commas.">
						<input
							value={form.labels}
							onChange={(event) => updateForm("labels", event.target.value)}
							placeholder="Chef recommended, Seasonal"
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

				{formError || updateItem.error ? (
					<p role="alert" className="text-error text-sm">
						{formError ?? updateItem.error?.message}
					</p>
				) : null}
			</form>
		</FormSheet>
	);
}
