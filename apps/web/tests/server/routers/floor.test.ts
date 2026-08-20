import { describe, expect, it, vi } from "vitest";
import type { Context } from "@/server/trpc/context";
import { requireOwnStaffId } from "@/server/routers/floor";

type StaffQueryResult = { data: { id: string; email?: string } | null; error: unknown };

function makeCtx(
	staffResults: StaffQueryResult[],
	stationSession: Context["stationSession"] = null,
): Context {
	let call = 0;
	const auth = {
		auth: {
			getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
		},
		from: vi.fn(() => {
			const result = staffResults[call] ?? { data: null, error: null };
			call += 1;
			const builder = {
				select: () => builder,
				eq: () => builder,
				in: () => builder,
				maybeSingle: async () => result,
			};
			return builder;
		}),
	};
	return {
		auth,
		stationSession,
		stationDeviceId: null,
	} as unknown as Context;
}

describe("requireOwnStaffId", () => {
	it("returns the staff id directly for a named (non-station) waiter", async () => {
		const ctx = makeCtx([
			{ data: { id: "staff-1", email: "real-waiter@example.com" }, error: null },
		]);
		await expect(requireOwnStaffId(ctx, "rest-1")).resolves.toBe("staff-1");
	});

	it("resolves to the PIN-unlocked waiter on a station device with a valid session", async () => {
		const ctx = makeCtx(
			[
				{
					data: { id: "station-1", email: "waiter-rest-1@stations.dineinly.internal" },
					error: null,
				},
				{ data: { id: "waiter-2" }, error: null },
			],
			{ staffId: "waiter-2", restaurantId: "rest-1" },
		);
		await expect(requireOwnStaffId(ctx, "rest-1")).resolves.toBe("waiter-2");
	});

	it("rejects a station device with no PIN session unlocked", async () => {
		const ctx = makeCtx([
			{
				data: { id: "station-1", email: "waiter-rest-1@stations.dineinly.internal" },
				error: null,
			},
		]);
		await expect(requireOwnStaffId(ctx, "rest-1")).rejects.toThrow(
			"Enter your PIN to continue.",
		);
	});

	it("rejects a station PIN session scoped to a different restaurant", async () => {
		const ctx = makeCtx(
			[
				{
					data: { id: "station-1", email: "waiter-rest-1@stations.dineinly.internal" },
					error: null,
				},
			],
			{ staffId: "waiter-2", restaurantId: "rest-OTHER" },
		);
		await expect(requireOwnStaffId(ctx, "rest-1")).rejects.toThrow(
			"Enter your PIN to continue.",
		);
	});

	it("rejects a PIN-unlocked waiter who is no longer active/eligible", async () => {
		const ctx = makeCtx(
			[
				{
					data: { id: "station-1", email: "waiter-rest-1@stations.dineinly.internal" },
					error: null,
				},
				{ data: null, error: null },
			],
			{ staffId: "waiter-2", restaurantId: "rest-1" },
		);
		await expect(requireOwnStaffId(ctx, "rest-1")).rejects.toThrow(
			"Enter your PIN to continue.",
		);
	});
});
