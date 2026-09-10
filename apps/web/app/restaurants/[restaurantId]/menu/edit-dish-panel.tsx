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
	ScheduleFields,
} from "@/components/form-sheet";
import { titleCase } from "@/lib/format";
import { firstFormError, menuItemInputSchema } from "@/lib/menu-item-schema";
import {
	PREP_TIME_OPTIONS,
	SERVING_SIZE_LABELS,
	SERVING_SIZE_OPTIONS,
} from "@/lib/menu-options";
import { trpc } from "@/lib/trpc-client";

type EditableMenuItem = {
	id: string;
	category_id: string;
	name: string;
	description: string | null;
	price: number;
	prep_time: (typeof PREP_TIME_OPTIONS)[number];
	serving_size: (typeof SERVING_SIZE_OPTIONS)[number];
	diet: "veg" | "non_veg";
	availability: "available" | "sold_out";
	schedule_days: number[] | null;
	schedule_start_time: string | null;
	schedule_end_time: string | null;
	labels: string[];
	offers_spice: boolean;
	offers_salt: boolean;
	offers_ice: boolean;
	status: "active" | "archived";
};

type MenuCategory = {
	id: string;
	name: string;
	status: "active" | "archived";
};
type MenuLabel = { id: string; name: string };

type FormState = {
	categoryId: string;
	name: string;
	description: string;
	price: string;
	prepTime: EditableMenuItem["prep_time"];
	servingSize: EditableMenuItem["serving_size"];
	diet: EditableMenuItem["diet"];
	availability: EditableMenuItem["availability"];
	scheduleDays: number[];
	scheduleStartTime: string;
	scheduleEndTime: string;
	labels: string[];
	offersSpice: EditableMenuItem["offers_spice"];
	offersSalt: EditableMenuItem["offers_salt"];
	offersIce: EditableMenuItem["offers_ice"];
	status: EditableMenuItem["status"];
};

function toFormState(item: EditableMenuItem): FormState {
	return {
		categoryId: item.category_id,
		name: item.name,
		description: item.description ?? "",
		price: String(item.price),
		prepTime: item.prep_time,
		servingSize: item.serving_size,
		diet: item.diet,
		availability: item.availability,
		scheduleDays: item.schedule_days ?? [],
		// Postgres returns "HH:MM:SS" — TIME_OPTIONS values are "HH:MM".
		scheduleStartTime: item.schedule_start_time?.slice(0, 5) ?? "",
		scheduleEndTime: item.schedule_end_time?.slice(0, 5) ?? "",
		labels: item.labels,
		offersSpice: item.offers_spice,
		offersSalt: item.offers_salt,
		offersIce: item.offers_ice,
		status: item.status,
	};
}

export function EditDishPanel({
	restaurantId,
	item,
	categories,
	labels,
	showPreferenceFields,
	onClose,
}: {
	restaurantId: string;
	item: EditableMenuItem;
	categories: MenuCategory[];
	labels: MenuLabel[];
	/** False for Dineinly Menu (docs/product.md § Dineinly Experiences) — it
	 * never takes orders, so offering a spice/salt/ice preference has
	 * nothing to apply to. */
	showPreferenceFields: boolean;
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

		const parsed = menuItemInputSchema.safeParse({
			restaurantId,
			categoryId: form.categoryId,
			name: form.name,
			description: form.description.trim() || null,
			price: Number(form.price),
			prepTime: form.prepTime,
			servingSize: form.servingSize,
			diet: form.diet,
			availability: form.availability,
			status: form.status,
			scheduleDays: form.scheduleDays.length > 0 ? form.scheduleDays : null,
			scheduleStartTime: form.scheduleStartTime || null,
			scheduleEndTime: form.scheduleEndTime || null,
			labels: form.labels,
			offersSpice: form.offersSpice,
			offersSalt: form.offersSalt,
			offersIce: form.offersIce,
		});
		if (!parsed.success) {
			setFormError(firstFormError(parsed.error));
			return;
		}

		updateItem.mutate({ ...parsed.data, itemId: item.id });
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
							onChange={(event) => updateForm("name", event.target.value)}
						/>
					</Field>

					<Field label="Description" className="resize-y">
						<textarea
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
						<Field label="Preparation time" required>
							<select
								value={form.prepTime}
								onChange={(event) =>
									updateForm(
										"prepTime",
										event.target.value as FormState["prepTime"],
									)
								}
							>
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
							value={form.servingSize}
							onChange={(event) =>
								updateForm(
									"servingSize",
									event.target.value as FormState["servingSize"],
								)
							}
						>
							{SERVING_SIZE_OPTIONS.map((option) => (
								<option key={option} value={option}>
									{SERVING_SIZE_LABELS[option]}
								</option>
							))}
						</select>
					</Field>

					<ScheduleFields
						days={form.scheduleDays}
						startTime={form.scheduleStartTime}
						endTime={form.scheduleEndTime}
						onDaysChange={(value) => updateForm("scheduleDays", value)}
						onStartTimeChange={(value) =>
							updateForm("scheduleStartTime", value)
						}
						onEndTimeChange={(value) => updateForm("scheduleEndTime", value)}
					/>
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

				{formError || updateItem.error ? (
					<p role="alert" className="text-error text-sm">
						{formError ?? updateItem.error?.message}
					</p>
				) : null}
			</form>
		</FormSheet>
	);
}
