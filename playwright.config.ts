import { defineConfig, devices } from "@playwright/test";

// E2E suite against the local dev stack — see e2e/README.md for
// prerequisites (Supabase stack + `pnpm dev` already running). Deliberately
// no `webServer` block: starting the dev server is a human/CI action, not
// something running this config should trigger on its own.
export default defineConfig({
	testDir: "./e2e/specs",
	globalSetup: "./e2e/global-setup.ts",
	// Serial for now — several specs deliberately share Restaurant 1's
	// fixture rows (see e2e/README.md "Data isolation"); safe parallelism is
	// a follow-up once that's proven out in practice, not a v1 default.
	workers: 1,
	fullyParallel: false,
	retries: 0,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL: "http://127.0.0.1:3000",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
