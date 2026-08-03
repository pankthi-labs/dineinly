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
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer: ReactNode;
	/** Blocks Escape/backdrop/× dismissal while a mutation is in flight, so a
	 * stray tap can't unmount the panel mid-submit and swallow the result. */
	isSubmitting?: boolean;
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
				aria-labelledby={titleId}
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
			className={`grid grid-cols-1 gap-x-6 ${columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
		>
			{children}
		</div>
	);
}

type SpiceValue = "mild" | "regular" | "extra spicy" | null;
type SaltValue = "less salt" | "regular" | null;
type IceValue = "none" | "less" | "regular" | null;

/** The Spice/Salt/Ice row shared by AddDishPanel and EditDishPanel — every
 * dish has the same three optional preferences, each "Not offered" by
 * default. */
export function PreferenceFields({
	spice,
	salt,
	ice,
	onSpiceChange,
	onSaltChange,
	onIceChange,
}: {
	spice: SpiceValue;
	salt: SaltValue;
	ice: IceValue;
	onSpiceChange: (value: SpiceValue) => void;
	onSaltChange: (value: SaltValue) => void;
	onIceChange: (value: IceValue) => void;
}) {
	return (
		<FieldRow columns={3}>
			<Field label="Spice">
				<select
					value={spice ?? ""}
					onChange={(event) =>
						onSpiceChange((event.target.value || null) as SpiceValue)
					}
				>
					<option value="">Not offered</option>
					<option value="mild">mild</option>
					<option value="regular">regular</option>
					<option value="extra spicy">extra spicy</option>
				</select>
			</Field>
			<Field label="Salt">
				<select
					value={salt ?? ""}
					onChange={(event) =>
						onSaltChange((event.target.value || null) as SaltValue)
					}
				>
					<option value="">Not offered</option>
					<option value="less salt">less salt</option>
					<option value="regular">regular</option>
				</select>
			</Field>
			<Field label="Ice">
				<select
					value={ice ?? ""}
					onChange={(event) =>
						onIceChange((event.target.value || null) as IceValue)
					}
				>
					<option value="">Not offered</option>
					<option value="none">none</option>
					<option value="less">less</option>
					<option value="regular">regular</option>
				</select>
			</Field>
		</FieldRow>
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
			) : hint ? (
				<p className="mt-2 text-muted text-sm">{hint}</p>
			) : null}
		</div>
	);
}
