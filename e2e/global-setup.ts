import { chromium, type FullConfig } from "@playwright/test";
import {
	ARBOR_OWNER_EMAIL,
	ARBOR_OWNER_STORAGE_STATE,
	OTP_ROLES,
} from "./fixtures/roles";
import { signInViaOtp } from "./helpers/otp-sign-in";

const MAILPIT_URL = "http://127.0.0.1:54324";

async function preflight(baseURL: string): Promise<void> {
	const checks = [
		{ name: "dev server", url: baseURL },
		{ name: "Mailpit", url: `${MAILPIT_URL}/api/v1/messages` },
	];
	for (const check of checks) {
		try {
			await fetch(check.url);
		} catch {
			throw new Error(
				`Can't reach the ${check.name} at ${check.url}. Is \`pnpm db:start\` and \`pnpm dev\` running? See e2e/README.md.`,
			);
		}
	}
}

// Runs once before any spec: authenticates every OTP-capable role via the
// real /sign-in UI (proving that flow works for real, once per run) and
// saves Playwright storageState per role, so individual spec files reuse a
// session instead of repeating the OTP round-trip for every test.
export default async function globalSetup(config: FullConfig): Promise<void> {
	const baseURL = config.projects[0]?.use.baseURL ?? "http://127.0.0.1:3000";
	await preflight(baseURL);

	const browser = await chromium.launch();

	for (const role of Object.values(OTP_ROLES)) {
		const context = await browser.newContext({ baseURL });
		const page = await context.newPage();
		await signInViaOtp(page, role.email);
		await context.storageState({ path: role.storageStatePath });
		await context.close();
	}

	// Arbor's owner — a sixth identity, not part of OTP_ROLES since only
	// tables.spec.ts's read-only checks need it.
	const arborContext = await browser.newContext({ baseURL });
	const arborPage = await arborContext.newPage();
	await signInViaOtp(arborPage, ARBOR_OWNER_EMAIL);
	await arborContext.storageState({ path: ARBOR_OWNER_STORAGE_STATE });
	await arborContext.close();

	await browser.close();
}
