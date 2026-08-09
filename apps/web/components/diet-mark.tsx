/**
 * FSSAI mark: veg is a green square with a green dot; non-veg is a brown
 * square with a brown triangle — the shapes, not just the color, carry the
 * meaning. Shared between the staff menu editor and the guest menu — same
 * visual, different callers (docs/architecture.md § Route Structure: share
 * the rendering component, not the route).
 */
export function DietMark({ diet }: { diet: "veg" | "non_veg" }) {
	const label = diet === "veg" ? "Vegetarian" : "Non-vegetarian";
	return (
		<span
			role="img"
			aria-label={label}
			className={`flex size-4 items-center justify-center rounded-xs border ${diet === "veg" ? "border-success" : "border-error"}`}
		>
			{diet === "veg" ? (
				<span aria-hidden="true" className="size-1 rounded-full bg-success" />
			) : (
				<span
					aria-hidden="true"
					className="size-1 bg-error"
					style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}
				/>
			)}
		</span>
	);
}
