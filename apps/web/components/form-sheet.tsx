"use client";

import { ChevronDown, X } from "lucide-react";
import {
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useEffect,
	useId,
	useState,
} from "react";
import { titleCase } from "@/lib/format";
import { useDismissableOverlay } from "./use-dismissable-overlay";

const OPEN_MOTION = "duration-(--duration-deliberate) ease-emphasized";
const CLOSE_MOTION = "duration-(--duration-base) ease-in";
// Matches --duration-base (packages/ui/src/styles/tokens.css) — the unmount
// must wait out the same transition the close motion runs on.
const CLOSE_ANIMATION_MS = 200;

/**
 * The one form container for every create/edit surface in the app: a bottom
 * sheet below `md`, a right-anchored dock at `md` and up (design-system.md
 * §05 Bottom Sheet / Side Dock). `children` supplies its own `<form id=...>`
 * around the fields; `footer` is typically a submit button referencing that
 * id via the `form` attribute, so the footer stays pinned outside the
 * scrolling body.
 */
export function FormSheet({
	title,
	onClose,
	children,
	footer,
	isSubmitting = false,
	hideHeader = false,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer: ReactNode;
	/** Blocks Escape/backdrop/× dismissal while a mutation is in flight, so a
	 * stray tap can't unmount the panel mid-submit and swallow the result. */
	isSubmitting?: boolean;
	/** Skips the bordered title bar + × button for content that supplies its
	 * own heading inline (e.g. a dish name sitting next to its price) — the
	 * bar would duplicate it. `title` still labels the dialog via
	 * `aria-label`. Dismissal falls back to backdrop tap / Escape. */
	hideHeader?: boolean;
}) {
	const [isVisible, setIsVisible] = useState(false);
	const [isClosing, setIsClosing] = useState(false);
	const titleId = useId();
	// FormSheet only ever renders while open — the caller unmounts it, there's
	// no internal closed state — so `open` is always true here.
	const containerRef = useDismissableOverlay<HTMLDivElement>(true, handleClose);

	useEffect(() => {
		const frame = requestAnimationFrame(() => setIsVisible(true));
		return () => cancelAnimationFrame(frame);
	}, []);

	function handleClose() {
		if (isSubmitting) return;
		setIsClosing(true);
		setTimeout(onClose, CLOSE_ANIMATION_MS);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: decorative backdrop, click-to-dismiss only — Escape (useDismissableOverlay) is the keyboard equivalent.
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above.
		<div
			onClick={handleClose}
			className={`fixed inset-0 z-(--z-overlay) bg-glass transition-opacity duration-(--duration-base) ease-out ${
				isVisible && !isClosing ? "opacity-100" : "opacity-0"
			}`}
		>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: only stops the backdrop's click-to-dismiss from bubbling — not itself an interactive affordance. */}
			<div
				ref={containerRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={hideHeader ? undefined : titleId}
				aria-label={hideHeader ? title : undefined}
				onClick={(event) => event.stopPropagation()}
				className={`fixed inset-x-0 bottom-0 z-(--z-modal) flex max-h-[85dvh] w-full flex-col rounded-t-3xl border-divider border-t bg-surface-elevated shadow-lg transition-transform md:inset-x-auto md:inset-y-0 md:right-0 md:bottom-auto md:h-full md:max-h-none md:w-full md:max-w-xl md:rounded-t-none md:rounded-l-3xl md:border-t-0 md:border-l ${
					isClosing ? CLOSE_MOTION : OPEN_MOTION
				} ${
					isVisible && !isClosing
						? "translate-y-0 md:translate-x-0"
						: "translate-y-full md:translate-x-full md:translate-y-0"
				}`}
			>
				<div
					className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-divider md:hidden"
					aria-hidden="true"
				/>
				{hideHeader ? null : (
					<div className="flex w-full items-center justify-between border-divider border-b px-6 py-5">
						<h2 id={titleId} className="text-2xl text-primary">
							{title}
						</h2>
						<button
							type="button"
							onClick={handleClose}
							disabled={isSubmitting}
							className="icon-tap-target rounded-full text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary disabled:cursor-not-allowed disabled:text-muted"
						>
							<X className="icon-md" strokeWidth={1.5} aria-hidden="true" />
							<span className="sr-only">Close</span>
						</button>
					</div>
				)}

				<div className="flex-1 overflow-y-auto px-6 py-8">{children}</div>

				<div className="border-divider border-t px-6 py-5">{footer}</div>
			</div>
		</div>
	);
}

/**
 * One bordered card per logical section of a form — the only box in the
 * whole design. The heading is the only hairline inside it; rows below get
 * spacing, not dividers, so the sole remaining line anywhere in the card is
 * each Field's own underline — nothing to confuse it with.
 */
export function FieldGroup({
	legend,
	children,
}: {
	legend: string;
	children: ReactNode;
}) {
	const id = useId();
	return (
		<section
			aria-labelledby={id}
			className="overflow-hidden rounded-xl border border-divider bg-surface"
		>
			<h3
				id={id}
				className="border-divider border-b px-5 py-4 text-caps text-secondary"
			>
				{legend}
			</h3>
			{children}
		</section>
	);
}

/** Two or three Fields sharing one row, separated by a gap rather than a
 * divider — each Field still carries its own underline. */
export function FieldRow({
	columns = 2,
	children,
}: {
	columns?: 2 | 3;
	children: ReactNode;
}) {
	return (
		<div
			className={`grid grid-cols-1 gap-x-6 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}
		>
			{children}
		</div>
	);
}

/** One preference toggle: whether the guest gets to choose a value for this
 * preference at order time. The value options themselves (mild/regular/extra
 * spicy, etc.) are fixed per preference and never set here — only whether
 * the preference applies to this dish at all. */
function OfferedField({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center gap-2 text-base text-primary">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="accent-current"
			/>
			{label}
		</label>
	);
}

/** The Spice/Salt/Ice row shared by AddDishPanel and EditDishPanel — each is
 * a plain on/off toggle for whether the dish offers that preference; the
 * guest picks the actual value (mild/regular/extra spicy, etc.) at order
 * time, not here. */
export function PreferenceFields({
	offersSpice,
	offersSalt,
	offersIce,
	onOffersSpiceChange,
	onOffersSaltChange,
	onOffersIceChange,
}: {
	offersSpice: boolean;
	offersSalt: boolean;
	offersIce: boolean;
	onOffersSpiceChange: (value: boolean) => void;
	onOffersSaltChange: (value: boolean) => void;
	onOffersIceChange: (value: boolean) => void;
}) {
	return (
		<div className="px-5 py-4">
			<p className="text-secondary text-sm">Guest preferences</p>
			<div className="mt-2 flex flex-wrap gap-6 pb-2">
				<OfferedField
					label="Spice level"
					checked={offersSpice}
					onChange={onOffersSpiceChange}
				/>
				<OfferedField
					label="Salt level"
					checked={offersSalt}
					onChange={onOffersSaltChange}
				/>
				<OfferedField
					label="Ice level"
					checked={offersIce}
					onChange={onOffersIceChange}
				/>
			</div>
		</div>
	);
}

/** The bounded, restaurant-managed label set (see menu_labels) — a dish
 * carries at most one, so a single select rather than a multi-pick control.
 * New labels are added from the Menu Desk header, not here. */
export function LabelFields({
	labels,
	selected,
	onChange,
}: {
	labels: { id: string; name: string }[];
	selected: string[];
	onChange: (labels: string[]) => void;
}) {
	if (labels.length === 0) {
		return (
			<p className="px-5 py-4 text-muted text-sm">
				No labels yet — add one from the Menu Desk header.
			</p>
		);
	}

	return (
		<Field label="Label">
			<select
				value={selected[0] ?? ""}
				onChange={(event) =>
					onChange(event.target.value ? [event.target.value] : [])
				}
			>
				<option value="">No label</option>
				{labels.map((label) => (
					<option key={label.id} value={label.name}>
						{titleCase(label.name)}
					</option>
				))}
			</select>
		</Field>
	);
}

const FIELD_VALUE_CLASS =
	"w-full border-0 bg-transparent p-0 text-primary text-base placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:text-muted";

/**
 * A single labeled row inside a FieldGroup. No box, no fill. Two cues: a
 * left accent bar on the row (gold while focused, red while invalid), plus
 * the value's own solid underline, bright enough at rest to read clearly.
 */
export function Field({
	label,
	required,
	error,
	hint,
	className,
	children,
}: {
	label: string;
	required?: boolean;
	error?: string;
	hint?: string;
	className?: string;
	children: ReactElement<{
		id?: string;
		className?: string;
		"aria-invalid"?: boolean;
		"aria-describedby"?: string;
	}>;
}) {
	const id = useId();
	const errorId = useId();
	const isSelect = isValidElement(children) && children.type === "select";

	return (
		<div className="group relative px-5 py-4">
			<span
				aria-hidden="true"
				className={`absolute inset-y-0 left-0 w-(--space-0_5) transition-transform duration-(--duration-base) ease-out ${
					error
						? "scale-y-100 bg-error"
						: "scale-y-0 bg-accent group-focus-within:scale-y-100"
				}`}
			/>
			<label htmlFor={id} className="text-secondary text-sm">
				{label}
				{required ? (
					<span className="ml-1 text-accent-secondary">*</span>
				) : null}
			</label>
			<div
				className={`relative mt-2 border-b pb-2 transition-colors duration-(--duration-base) ease-out ${
					error ? "border-error" : "border-secondary focus-within:border-accent"
				}`}
			>
				{cloneElement(children, {
					id,
					className: `${FIELD_VALUE_CLASS} ${isSelect ? "appearance-none pr-6" : ""} ${children.props.className ?? ""} ${className ?? ""}`,
					"aria-invalid": error ? true : undefined,
					"aria-describedby": error ? errorId : undefined,
				})}
				{isSelect ? (
					<ChevronDown
						aria-hidden="true"
						className="icon-sm pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-muted"
						strokeWidth={1.5}
					/>
				) : null}
			</div>
			{error ? (
				<p id={errorId} role="alert" className="mt-2 text-error text-sm">
					{error}
				</p>
			) : null}
			{hint ? <p className="mt-2 text-muted text-sm">{hint}</p> : null}
		</div>
	);
}
