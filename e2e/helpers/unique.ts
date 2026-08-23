// Every CREATE in the suite uses one of these — never a fixed literal name —
// so specs stay safe to re-run against a DB that hasn't been reset, and
// never collide with a parallel run or a prior run's leftovers.
function suffix(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueName(prefix: string): string {
	return `${prefix} ${suffix()}`;
}

// `+tag` addressing on the real seeded domain — stays deliverable via
// Mailpit (which doesn't validate mailbox existence) while never colliding
// with a seed row or a prior run's invite.
export function uniqueEmail(prefix: string, domain = "dineinly.test"): string {
	return `${prefix}+e2e-${suffix()}@${domain}`;
}
