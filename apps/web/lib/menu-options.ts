export const PREP_TIME_OPTIONS = [
	"5-10 mins",
	"10-15 mins",
	"15-20 mins",
	"20-30 mins",
	"30-45 mins",
] as const;

export const SERVING_SIZE_OPTIONS = [
	"serves 1",
	"serves 1-2",
	"serves 2",
	"serves 2-3",
	"serves 4-5",
	"serves 5+",
] as const;

export const SERVING_SIZE_LABELS: Record<
	(typeof SERVING_SIZE_OPTIONS)[number],
	string
> = {
	"serves 1": "Individual",
	"serves 1-2": "Ideal for Two",
	"serves 2": "For Two",
	"serves 2-3": "Perfect for Sharing",
	"serves 4-5": "Family Size",
	"serves 5+": "Party Size",
};

// The person-count, split from SERVING_SIZE_LABELS's name — two different
// pieces of information, not one string with a formatting choice baked in.
// A caller composes them however its own layout needs (inline, on a second
// line, etc.) rather than the data dictating that.
export const SERVING_SIZE_COUNTS: Record<
	(typeof SERVING_SIZE_OPTIONS)[number],
	string
> = {
	"serves 1": "1 person",
	"serves 1-2": "1–2 persons",
	"serves 2": "2 persons",
	"serves 2-3": "2–3 persons",
	"serves 4-5": "4–5 persons",
	"serves 5+": "5+ persons",
};

/** Name + count on one line — the dropdown/inline reading. */
export function formatServingSize(
	option: (typeof SERVING_SIZE_OPTIONS)[number],
): string {
	return `${SERVING_SIZE_LABELS[option]} (${SERVING_SIZE_COUNTS[option]})`;
}

// Guest-selectable preference values (docs/product.md: fixed per preference,
// chosen by the guest at order time — never at dish creation, which only
// toggles offers_spice/offers_salt/offers_ice).
export const SPICE_OPTIONS = ["mild", "regular", "extra spicy"] as const;
export const SALT_OPTIONS = ["less salt", "regular"] as const;
export const ICE_OPTIONS = ["none", "less", "regular"] as const;

// "none"/"less" read as bare words without their noun — titleCase alone
// isn't enough here, unlike spice/salt where titleCase(value) is legible.
export const ICE_LABELS: Record<(typeof ICE_OPTIONS)[number], string> = {
	none: "No Ice",
	less: "Less Ice",
	regular: "Regular",
};
