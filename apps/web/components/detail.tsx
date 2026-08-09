/** One label/value block — shared by the staff menu editor and the guest
 * item drawer (docs/architecture.md § Route Structure: share the rendering
 * component, not the route). */
export function Detail({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-caps text-muted">{label}</p>
			<p className="mt-3 whitespace-pre-line text-primary text-sm">{value}</p>
		</div>
	);
}
