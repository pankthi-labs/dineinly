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
	"serves 1": "Individual (Serves 1)",
	"serves 1-2": "Ideal for Two (Serves 1–2)",
	"serves 2": "For Two (Serves 2)",
	"serves 2-3": "Perfect for Sharing (Serves 2–3)",
	"serves 4-5": "Family Size (Serves 4–5)",
	"serves 5+": "Party Size (Serves 5+)",
};
