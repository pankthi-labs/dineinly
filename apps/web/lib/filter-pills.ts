// A status/role pill only earns its place if some rows have it and some
// don't — a collection that's all one value has nothing to filter. Shared by
// Bills, Table Matrix, and Staff Roster, which all filter a fixed value set
// down to whichever ones the current data actually splits on.
export function visibleFilters<V extends string>(
	filters: Array<{ value: V | "all"; label: string }>,
	presentValues: V[],
): Array<{ value: V | "all"; label: string }> {
	return presentValues.length > 1
		? filters.filter(
				(filter) =>
					filter.value === "all" || presentValues.includes(filter.value as V),
			)
		: [];
}
