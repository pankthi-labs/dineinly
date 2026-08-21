import { describe, expect, it, vi } from "vitest";
import { requireOwnStaffId } from "@/server/routers/floor";
import type { Context } from "@/server/trpc/context";

type StaffQueryResult = {
	data: { id: string; email?: string } | null;
	error: unknown;
};
type RpcResult = {
	data: unknown;
	error: unknown;
};

function makeCtx(
	staffResults: StaffQueryResult[],
	stationSession: Context["stationSession"] = null,
	rpcResults: RpcResult[] = [],
	stationDeviceId: string | null = null,
): Context {
	let fromCall = 0;
	let rpcCall = 0;
	const auth = {
		auth: {
			getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
		},
		from: vi.fn(() => {
			const result = staffResults[fromCall] ?? { data: null, error: null };
			fromCall += 1;
			const builder = {
				select: () => builder,
				eq: () => builder,
				in: () => builder,
				maybeSingle: async () => result,
			};
			return builder;
		}),
		rpc: vi.fn(async () => {
			const result = rpcResults[rpcCall] ?? { data: null, error: null };
			rpcCall += 1;
			return result;
		}),
	};
	return {
		auth,
		stationSession,
		stationDeviceId,
	} as unknown as Context;
}

describe("requireOwnStaffId", () => {
	it("returns the staff id directly for a named (non-station) waiter", async () => {
		const ctx = makeCtx([
			{
				data: { id: "staff-1", email: "real-waiter@example.com" },
				error: null,
			},
		]);
		await expect(requireOwnStaffId(ctx, "rest-1")).resolves.toBe("staff-1");
	});

	it("resolves to the PIN-unlocked waiter on a station device with a valid session", async () => {
		const ctx = makeCtx(
			[
				{
					data: {
						id: "station-1",
						email: "waiter-rest-1@stations.dineinly.internal",
					},
					error: null,
				},
			],
			{ staffId: "waiter-2", restaurantId: "rest-1" },
			[{ data: [{ id: "waiter-2", name: "Waiter Two" }], error: null }],
		);
		await expect(requireOwnStaffId(ctx, "rest-1")).resolves.toBe("waiter-2");
	});

	it("rejects a station device with no PIN session unlocked", async () => {
		const ctx = makeCtx([
			{
				data: {
					id: "station-1",
					email: "waiter-rest-1@stations.dineinly.internal",
				},
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
					data: {
						id: "station-1",
						email: "waiter-rest-1@stations.dineinly.internal",
					},
					error: null,
				},
			],
			{ staffId: "waiter-2", restaurantId: "rest-OTHER" },
		);
		await expect(requireOwnStaffId(ctx, "rest-1")).rejects.toThrow(
			"Enter your PIN to continue.",
		);
	});

	it("rejects a revoked device even with a valid PIN session", async () => {
		const ctx = makeCtx(
			[
				{
					data: {
						id: "station-1",
						email: "waiter-rest-1@stations.dineinly.internal",
					},
					error: null,
				},
			],
			{ staffId: "waiter-2", restaurantId: "rest-1" },
			[
				{ data: [{ id: "waiter-2", name: "Waiter Two" }], error: null },
				{ data: true, error: null },
			],
			"device-1",
		);
		await expect(requireOwnStaffId(ctx, "rest-1")).rejects.toThrow(
			"This device was removed. Pair it again.",
		);
	});

	it("rejects a PIN-unlocked waiter who is no longer active/eligible", async () => {
		const ctx = makeCtx(
			[
				{
					data: {
						id: "station-1",
						email: "waiter-rest-1@stations.dineinly.internal",
					},
					error: null,
				},
			],
			{ staffId: "waiter-2", restaurantId: "rest-1" },
			[{ data: null, error: null }],
		);
		await expect(requireOwnStaffId(ctx, "rest-1")).rejects.toThrow(
			"Enter your PIN to continue.",
		);
	});
});
