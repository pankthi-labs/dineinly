"use client";

// Compact quantity control shared by the guest menu card and the review-order
// screen (docs/design-system.md §11: quick actions inside rows/cards skip
// icons — "packed, read linearly"). At value 0 it renders "Add" instead of
// the stepper: both states are this one element with one SHELL class string,
// so the control cannot change size when a guest taps it. Fixed h-8/w-16
// (32x64px) keeps it inside the price column's width and stops the row from
// reflowing on every add — widened from 32x48px so the −/+ buttons clear a
// comfortable thumb width apart after the gap and digit eat into the shell;
// height stays at the original 32px so the pill doesn't tower over the
// text-lg price sitting in the row above it. The label carries no "+"
// because the shell is the affordance and the glyph only crowds it. Gold
// border, no fill — same active-state border color as the preference
// pickers in the item drawer, so every bordered pill in the guest flow
// reads as one family. Gold label while it's still an invitation to act
// (§ accent = actions); once there's a quantity the control is state, not a
// call to action, so its contents drop to primary text and only the border
// stays gold.
const SHELL =
	"flex h-8 w-16 shrink-0 items-center justify-center rounded-pill border border-accent";

export function QuantityPill({
	value,
	onDecrement,
	onIncrement,
	max,
	disabled = false,
	disableDecrement = false,
}: {
	value: number;
	onDecrement: () => void;
	onIncrement: () => void;
	// Caps the stepper (a bounded correction editor) instead of an unbounded
	// cart add. Passing max also opts out of the value-0 "Add" state below —
	// a bounded editor still needs its −/+ shell visible at 0, unlike the
	// cart's "nothing added yet" affordance.
	max?: number;
	disabled?: boolean;
	// For a displayed value that blends live cart quantity with quantity
	// already placed elsewhere (e.g. an earlier confirmed round) — decrementing
	// only ever removes from the cart side, so this stays true once that part
	// hits 0 even though the shown value is still above 0.
	disableDecrement?: boolean;
}) {
	if (value === 0 && max === undefined) {
		return (
			<button
				type="button"
				onClick={onIncrement}
				disabled={disabled}
				className={`${SHELL} font-medium text-accent text-sm disabled:cursor-not-allowed disabled:opacity-60`}
			>
				Add
			</button>
		);
	}

	return (
		<div className={`${SHELL} gap-1`}>
			<button
				type="button"
				aria-label="Decrease quantity"
				onClick={onDecrement}
				disabled={disabled || disableDecrement || value <= 0}
				className="flex h-full flex-1 items-center justify-center font-medium text-primary text-sm leading-none transition-colors duration-(--duration-base) ease-out hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-primary"
			>
				−
			</button>
			<span className="text-center text-primary text-sm tabular-nums">
				{value}
			</span>
			<button
				type="button"
				aria-label="Increase quantity"
				onClick={onIncrement}
				disabled={disabled || (max !== undefined && value >= max)}
				className="flex h-full flex-1 items-center justify-center font-medium text-primary text-sm leading-none transition-colors duration-(--duration-base) ease-out hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-primary"
			>
				+
			</button>
		</div>
	);
}
