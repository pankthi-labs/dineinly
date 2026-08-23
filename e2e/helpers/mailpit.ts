// Local Supabase's SMTP catch-all (supabase/config.toml `[inbucket]`) —
// Mailpit's REST API returns the OTP code as plain text inside each
// message's `Snippet` field, confirmed against a real send:
// `GET /api/v1/messages` → { messages: [{ To, Snippet, Created, ... }] },
// newest first.
const MAILPIT_URL = "http://127.0.0.1:54324";
const OTP_REGEX = /\b(\d{6})\b/;

type MailpitMessage = {
	To: { Address: string }[];
	Snippet: string;
	Created: string;
};

type MailpitListResponse = {
	messages: MailpitMessage[];
};

/**
 * Polls Mailpit for the newest sign-in-code email addressed to `email` and
 * returns its 6-digit code. Call this only *after* the page has triggered
 * `signInWithOtp` — "newest message for that recipient" is only unambiguous
 * once the send has actually happened.
 */
export async function waitForOtpCode(
	email: string,
	options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
	const { timeoutMs = 20_000, intervalMs = 500 } = options;
	const deadline = Date.now() + timeoutMs;
	const target = email.toLowerCase();

	while (Date.now() < deadline) {
		const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
		if (response.ok) {
			const data = (await response.json()) as MailpitListResponse;
			const match = data.messages.find((message) =>
				message.To.some((to) => to.Address.toLowerCase() === target),
			);
			if (match) {
				const code = match.Snippet.match(OTP_REGEX)?.[1];
				if (code) {
					return code;
				}
			}
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new Error(
		`Timed out waiting for a sign-in code email to ${email} (checked Mailpit at ${MAILPIT_URL} for ${timeoutMs}ms). Is the Supabase stack running (\`pnpm db:start\`)?`,
	);
}
