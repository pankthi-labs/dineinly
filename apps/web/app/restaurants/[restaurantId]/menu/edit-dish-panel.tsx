"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { SideDrawer } from "./side-drawer";

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

const fieldClassName =
	"w-full rounded-sm border border-divider bg-background px-3 py-3 text-primary text-sm outline-none transition-colors duration-(--duration-base) ease-out focus:border-accent disabled:cursor-not-allowed disabled:text-muted";

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
	const nameInput = useRef<HTMLInputElement>(null);
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
		<SideDrawer
			title="Edit Dish"
			titleId="edit-dish-title"
			onClose={onClose}
			isBusy={updateItem.isPending}
			initialFocusRef={nameInput}
		>
			<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
				<div className="flex-1 overflow-y-auto px-6 py-8">
					<div className="flex flex-col gap-6">
						<Field id="edit-dish-category" label="Category" required>
							<select
								id="edit-dish-category"
								value={form.categoryId}
								onChange={(event) =>
									updateForm("categoryId", event.target.value)
								}
								className={fieldClassName}
							>
								{categories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.name}
										{category.status === "archived" ? " (Hidden)" : ""}
									</option>
								))}
							</select>
						</Field>

						<Field id="edit-dish-name" label="Dish name" required>
							<input
								id="edit-dish-name"
								ref={nameInput}
								required
								value={form.name}
								onChange={(event) => updateForm("name", event.target.value)}
								className={fieldClassName}
							/>
						</Field>

						<Field id="edit-dish-description" label="Description" required>
							<textarea
								id="edit-dish-description"
								required
								value={form.description}
								onChange={(event) =>
									updateForm("description", event.target.value)
								}
								className={`${fieldClassName} min-h-24 resize-y`}
							/>
						</Field>

						<div className="grid gap-6 sm:grid-cols-2">
							<Field id="edit-dish-price" label="Price (₹)" required>
								<input
									id="edit-dish-price"
									required
									type="number"
									min="0"
									step="0.01"
									value={form.price}
									onChange={(event) => updateForm("price", event.target.value)}
									className={fieldClassName}
								/>
							</Field>
							<Field id="edit-dish-status" label="Status" required>
								<select
									id="edit-dish-status"
									value={getDisplayStatus()}
									onChange={(event) =>
										setDisplayStatus(
											event.target.value as "live" | "sold_out" | "hidden",
										)
									}
									className={fieldClassName}
								>
									<option value="live">Live</option>
									<option value="sold_out">Sold out</option>
									<option value="hidden">Hidden</option>
								</select>
							</Field>
							<Field id="edit-dish-diet" label="Dietary type" required>
								<select
									id="edit-dish-diet"
									value={form.diet}
									onChange={(event) =>
										updateForm("diet", event.target.value as FormState["diet"])
									}
									className={fieldClassName}
								>
									<option value="veg">Vegetarian</option>
									<option value="non_veg">Non-vegetarian</option>
								</select>
							</Field>
							<Field
								id="edit-dish-prep-time"
								label="Preparation time (minutes)"
								required
							>
								<input
									id="edit-dish-prep-time"
									required
									type="number"
									min="1"
									step="1"
									value={form.prepTime}
									onChange={(event) =>
										updateForm("prepTime", event.target.value)
									}
									className={fieldClassName}
								/>
							</Field>
						</div>

						<Field id="edit-dish-serving-size" label="Serving size" required>
							<input
								id="edit-dish-serving-size"
								required
								value={form.servingSize}
								onChange={(event) =>
									updateForm("servingSize", event.target.value)
								}
								className={fieldClassName}
							/>
						</Field>

						<Field
							id="edit-dish-labels"
							label="Labels"
							hint="Separate labels with commas."
						>
							<input
								id="edit-dish-labels"
								value={form.labels}
								onChange={(event) => updateForm("labels", event.target.value)}
								className={fieldClassName}
								placeholder="Chef recommended, Seasonal"
							/>
						</Field>

						<fieldset>
							<legend className="text-caps text-primary">Preferences</legend>
							<div className="mt-3 grid gap-4 sm:grid-cols-3">
								<PreferenceSelect
									label="Spice"
									value={form.spice}
									options={["mild", "regular", "extra spicy"]}
									onChange={(value) =>
										updateForm("spice", value as FormState["spice"])
									}
								/>
								<PreferenceSelect
									label="Salt"
									value={form.salt}
									options={["less salt", "regular"]}
									onChange={(value) =>
										updateForm("salt", value as FormState["salt"])
									}
								/>
								<PreferenceSelect
									label="Ice"
									value={form.ice}
									options={["none", "less", "regular"]}
									onChange={(value) =>
										updateForm("ice", value as FormState["ice"])
									}
								/>
							</div>
						</fieldset>

						{formError || updateItem.error ? (
							<p role="alert" className="text-error text-sm">
								{formError ?? updateItem.error?.message}
							</p>
						) : null}
					</div>
				</div>
				<footer className="border-divider border-t bg-surface p-6">
					<button
						type="submit"
						disabled={updateItem.isPending}
						className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm transition-colors duration-(--duration-base) ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-muted"
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
				</footer>
			</form>
		</SideDrawer>
	);
}

function Field({
	id,
	label,
	required,
	hint,
	children,
}: {
	id: string;
	label: string;
	required?: boolean;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="block">
			<label htmlFor={id} className="text-caps text-primary">
				{label}
				{required ? " *" : ""}
			</label>
			{hint ? (
				<span className="mt-2 block text-muted text-sm">{hint}</span>
			) : null}
			<span className="mt-3 block">{children}</span>
		</div>
	);
}

function PreferenceSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string | null;
	options: string[];
	onChange: (value: string | null) => void;
}) {
	return (
		<label className="block">
			<span className="text-muted text-sm">{label}</span>
			<select
				value={value ?? ""}
				onChange={(event) => onChange(event.target.value || null)}
				className={`${fieldClassName} mt-2`}
			>
				<option value="">Not offered</option>
				{options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</label>
	);
}
