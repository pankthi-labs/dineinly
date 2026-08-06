import Image from "next/image";

// Matches the SVG's viewBox (public/brand/dineinly-logo-dark-v2.svg), cropped
// tight to the visible mark+wordmark — width is derived from height so every
// call site renders undistorted without repeating the ratio.
const ASPECT_RATIO = 252 / 58;

export function BrandLogo({
	height,
	priority,
	className,
}: {
	height: number;
	priority?: boolean;
	className?: string;
}) {
	const width = Math.round(height * ASPECT_RATIO);
	return (
		<Image
			src="/brand/dineinly-logo-dark-v2.svg"
			alt="Dineinly"
			width={width}
			height={height}
			style={{ width, height }}
			priority={priority}
			className={className}
		/>
	);
}

// The one sanctioned "Powered by Dineinly" pairing (docs/design-system.md §09).
// text-xs bundles Inter/w500/1.4 line-height/0.025em tracking as one token
// (packages/ui/src/styles/globals.css) — never overridden per call site.
// translate-y-px corrects the SVG's visual baseline, which sits fractionally
// above the text baseline even though both boxes report the same height.
export function PoweredByDineinly({ className }: { className?: string }) {
	return (
		<div className={`flex items-center gap-1 ${className ?? ""}`}>
			<span className="text-muted text-xs">Powered by</span>
			<BrandLogo height={12} className="translate-y-px" />
		</div>
	);
}
