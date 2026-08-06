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

/** Move `id` to the position `targetId` currently occupies. No-op if either
 * is missing. Symmetric in both directions — unlike inserting strictly
 * "before" the target, which is a no-op when `id` is already the target's
 * immediate predecessor (removing `id` slides the target into the exact
 * slot just vacated). */
export function moveIdTo(ids: string[], id: string, targetId: string) {
	if (id === targetId) return ids;
	const from = ids.indexOf(id);
	const to = ids.indexOf(targetId);
	if (from === -1 || to === -1) return ids;
	const next = [...ids];
	const [moved] = next.splice(from, 1);
	if (moved === undefined) return ids;
	next.splice(to, 0, moved);
	return next;
}
