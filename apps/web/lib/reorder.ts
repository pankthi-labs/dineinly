/** Swap `id` with its neighbor. No-op past either end of the list. */
export function moveId(ids: string[], id: string, direction: "up" | "down") {
	const index = ids.indexOf(id);
	const target = direction === "up" ? index - 1 : index + 1;
	if (index === -1 || target < 0 || target >= ids.length) return ids;
	const next = [...ids];
	const moved = next[index];
	const displaced = next[target];
	if (moved === undefined || displaced === undefined) return ids;
	next[index] = displaced;
	next[target] = moved;
	return next;
}

/** Move `id` to sit immediately before `targetId`. No-op if either is missing. */
export function moveIdBefore(ids: string[], id: string, targetId: string) {
	if (id === targetId) return ids;
	const from = ids.indexOf(id);
	if (from === -1) return ids;
	const next = [...ids];
	next.splice(from, 1);
	const to = next.indexOf(targetId);
	if (to === -1) return ids;
	next.splice(to, 0, id);
	return next;
}
