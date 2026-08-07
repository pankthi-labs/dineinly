const SIBLING_COUNT = 1;

/**
 * Windowed page list for a pager: first page, last page, one page on each
 * side of `current`, and "ellipsis" markers for any gap — instead of one
 * button per page, which doesn't scale past a handful of pages.
 */
export function getPageRange(
	current: number,
	total: number,
): Array<number | "ellipsis"> {
	if (total <= 0) return [];

	const windowSize = SIBLING_COUNT * 2 + 5; // first, last, current, siblings, both ellipses
	if (total <= windowSize) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}

	const leftSibling = Math.max(current - SIBLING_COUNT, 1);
	const rightSibling = Math.min(current + SIBLING_COUNT, total);
	const showLeftEllipsis = leftSibling > 2;
	const showRightEllipsis = rightSibling < total - 1;

	const pages: Array<number | "ellipsis"> = [1];
	if (showLeftEllipsis) pages.push("ellipsis");
	for (let page = leftSibling; page <= rightSibling; page++) {
		if (page !== 1 && page !== total) pages.push(page);
	}
	if (showRightEllipsis) pages.push("ellipsis");
	pages.push(total);
	return pages;
}
