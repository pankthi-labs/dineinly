import { cookies } from "next/headers";
import { describe, expect, it, vi } from "vitest";
import { mintGuestToken } from "@/lib/guest-token";
import { createContext } from "@/server/trpc/context";

// vi.mock factories are hoisted above the imports, so a factory closing
// over a plain top-level const would hit its temporal dead zone the
// moment the static import of @supabase/ssr runs — vi.hoisted avoids that.
const { createServerClient } = vi.hoisted(() => ({
	createServerClient: vi.fn((..._args: unknown[]) => ({})),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

describe("createContext", () => {
	it("never forwards a cookie that fails guest-token verification as a Bearer credential", async () => {
		// A correctly-shaped token with a tampered signature is the realistic
		// attack: anything Supabase would reject outright isn't the risk — the
		// risk is ctx.supabase authenticating as a principal that ctx.guest
		// simultaneously reports as invalid.
		const token = await mintGuestToken({
			restaurant_id: "9c858f5b-0d64-4d8a-9a1e-9f3c1a2b3c4d",
			table_session_id: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
			app_role: "guest",
		});
		const [header, payload, signature] = token.split(".");
		const tampered = `${header}.${payload}.${signature?.split("").reverse().join("")}`;

		vi.mocked(cookies).mockResolvedValue({
			get: () => ({ value: tampered }),
			getAll: () => [],
		} as never);

		const ctx = await createContext();

		expect(ctx.guest).toBeNull();
		const options = createServerClient.mock.calls[0]?.[2] as
			| { global?: unknown }
			| undefined;
		expect(options?.global).toBeUndefined();
	});
});
