import { describe, expect, it } from "vitest";
import {
	formatScheduleLabel,
	isScheduleActive,
} from "@/lib/menu-item-schedule";

const NO_SCHEDULE = {
	schedule_days: null,
	schedule_start_time: null,
	schedule_end_time: null,
};

// Asia/Kolkata (IST, UTC+5:30) — a UTC instant lets these pin an exact local
// day/time regardless of the machine's own timezone.
function utcInstant(isoUtc: string): Date {
	return new Date(isoUtc);
}

describe("isScheduleActive", () => {
	it("is always active with no schedule set", () => {
		expect(isScheduleActive(NO_SCHEDULE)).toBe(true);
	});

	it("is active on a listed day", () => {
		// 2026-09-12 is a Saturday.
		const saturdayNoon = utcInstant("2026-09-12T06:30:00Z");
		expect(
			isScheduleActive({ ...NO_SCHEDULE, schedule_days: [0, 6] }, saturdayNoon),
		).toBe(true);
	});

	it("is inactive on an unlisted day", () => {
		// 2026-09-14 is a Monday.
		const mondayNoon = utcInstant("2026-09-14T06:30:00Z");
		expect(
			isScheduleActive({ ...NO_SCHEDULE, schedule_days: [0, 6] }, mondayNoon),
		).toBe(false);
	});

	it("is active inside a same-day time window", () => {
		// 18:00 IST.
		const evening = utcInstant("2026-09-10T12:30:00Z");
		expect(
			isScheduleActive(
				{
					...NO_SCHEDULE,
					schedule_start_time: "17:00",
					schedule_end_time: "19:00",
				},
				evening,
			),
		).toBe(true);
	});

	it("is inactive outside a same-day time window", () => {
		// 10:00 IST.
		const morning = utcInstant("2026-09-10T04:30:00Z");
		expect(
			isScheduleActive(
				{
					...NO_SCHEDULE,
					schedule_start_time: "17:00",
					schedule_end_time: "19:00",
				},
				morning,
			),
		).toBe(false);
	});

	it("wraps a window that crosses midnight", () => {
		// 23:00 IST — inside a 22:00-02:00 window.
		const lateNight = utcInstant("2026-09-10T17:30:00Z");
		expect(
			isScheduleActive(
				{
					...NO_SCHEDULE,
					schedule_start_time: "22:00",
					schedule_end_time: "02:00",
				},
				lateNight,
			),
		).toBe(true);
		// 10:00 IST — outside that same window.
		const morning = utcInstant("2026-09-10T04:30:00Z");
		expect(
			isScheduleActive(
				{
					...NO_SCHEDULE,
					schedule_start_time: "22:00",
					schedule_end_time: "02:00",
				},
				morning,
			),
		).toBe(false);
	});

	it("combines day and time with AND", () => {
		// Saturday, 18:00 IST — matches both.
		const saturdayEvening = utcInstant("2026-09-12T12:30:00Z");
		expect(
			isScheduleActive(
				{
					schedule_days: [6],
					schedule_start_time: "17:00",
					schedule_end_time: "19:00",
				},
				saturdayEvening,
			),
		).toBe(true);
		// Saturday, 10:00 IST — right day, wrong time.
		const saturdayMorning = utcInstant("2026-09-12T04:30:00Z");
		expect(
			isScheduleActive(
				{
					schedule_days: [6],
					schedule_start_time: "17:00",
					schedule_end_time: "19:00",
				},
				saturdayMorning,
			),
		).toBe(false);
	});
});

describe("formatScheduleLabel", () => {
	it("returns null with no schedule set", () => {
		expect(formatScheduleLabel(NO_SCHEDULE)).toBeNull();
	});

	it("formats a time-only window", () => {
		expect(
			formatScheduleLabel({
				...NO_SCHEDULE,
				schedule_start_time: "17:00",
				schedule_end_time: "19:00",
			}),
		).toBe("Available 5:00 PM–7:00 PM");
	});

	it("formats a days-only schedule", () => {
		expect(formatScheduleLabel({ ...NO_SCHEDULE, schedule_days: [0, 6] })).toBe(
			"Available Sun, Sat",
		);
	});

	it("formats combined days and time", () => {
		expect(
			formatScheduleLabel({
				schedule_days: [6],
				schedule_start_time: "17:00",
				schedule_end_time: "19:00",
			}),
		).toBe("Available Sat · 5:00 PM–7:00 PM");
	});
});
