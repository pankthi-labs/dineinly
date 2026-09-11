// Scheduled availability for a menu item — a separate axis from the manual
// sold-out toggle (menu_items.availability). Field names match the DB
// columns (snake_case) so callers can pass a menu_items row straight through
// with no remapping. Null/empty schedule_days means every day; schedule_days
// holds 0 (Sunday) through 6 (Saturday), matching Postgres EXTRACT(DOW).
// schedule_start_time/schedule_end_time are always both null or both set. No
// per-restaurant timezone setting (docs/core-data-model.md), so every
// schedule reads in Asia/Kolkata, same as the server's
// is_menu_item_schedule_active() (supabase/migrations/
// 20260730150634_add_auth_fk_and_rls_policies.sql) — that function is the
// real enforcement at order time; this mirrors its logic for display so the
// guest menu can show the same "available now" state without a round trip.
export type MenuItemSchedule = {
	schedule_days: number[] | null;
	schedule_start_time: string | null;
	schedule_end_time: string | null;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function nowInRestaurantTimeZone(now: Date): { day: number; minutes: number } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Kolkata",
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(now);

	const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
	// hour12: false renders midnight as "24", not "00" — normalize back to 0.
	const hour = Number(parts.find((part) => part.type === "hour")?.value) % 24;
	const minute = Number(parts.find((part) => part.type === "minute")?.value);

	return {
		day: DAY_LABELS.indexOf(weekday as (typeof DAY_LABELS)[number]),
		minutes: hour * 60 + minute,
	};
}

function toMinutes(time: string): number {
	const [hour = 0, minute = 0] = time.split(":").map(Number);
	return hour * 60 + minute;
}

export function isScheduleActive(
	schedule: MenuItemSchedule,
	now: Date = new Date(),
): boolean {
	const days = schedule.schedule_days;
	const hasDays = days !== null && days.length > 0;
	const hasTime =
		schedule.schedule_start_time !== null &&
		schedule.schedule_end_time !== null;

	if (!hasDays && !hasTime) return true;

	const current = nowInRestaurantTimeZone(now);

	if (hasDays && !days.includes(current.day)) return false;

	if (hasTime) {
		const start = toMinutes(schedule.schedule_start_time as string);
		const end = toMinutes(schedule.schedule_end_time as string);
		const inWindow =
			start <= end
				? current.minutes >= start && current.minutes < end
				: current.minutes >= start || current.minutes < end;
		if (!inWindow) return false;
	}

	return true;
}

/** Every half-hour in a day, "00:00".."23:30" — backs the Add/Edit Dish time dropdowns. */
export const TIME_OPTIONS: readonly string[] = Array.from(
	{ length: 48 },
	(_, i) => {
		const hour = Math.floor(i / 2);
		const minute = i % 2 === 0 ? "00" : "30";
		return `${String(hour).padStart(2, "0")}:${minute}`;
	},
);

export function formatClockTime(time: string): string {
	const [hour = 0, minute = 0] = time.split(":").map(Number);
	const period = hour >= 12 ? "PM" : "AM";
	const displayHour = hour % 12 === 0 ? 12 : hour % 12;
	return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatDays(days: number[]): string {
	const sorted = [...days].sort((a, b) => a - b);
	return sorted.map((day) => DAY_LABELS[day]).join(", ");
}

/** e.g. "Available 5:00 PM–7:00 PM" / "Available Sat, Sun" / "Available Fri, Sat, Sun · 5:00 PM–7:00 PM". Null when the item has no schedule. */
export function formatScheduleLabel(schedule: MenuItemSchedule): string | null {
	const days = schedule.schedule_days;
	const hasDays = days !== null && days.length > 0;
	const hasTime =
		schedule.schedule_start_time !== null &&
		schedule.schedule_end_time !== null;

	if (!hasDays && !hasTime) return null;

	const parts: string[] = [];
	if (hasDays) parts.push(formatDays(days));
	if (hasTime) {
		parts.push(
			`${formatClockTime(schedule.schedule_start_time as string)}–${formatClockTime(schedule.schedule_end_time as string)}`,
		);
	}
	return `Available ${parts.join(" · ")}`;
}
