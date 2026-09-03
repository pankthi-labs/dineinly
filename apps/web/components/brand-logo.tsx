import Image from "next/image";

// Matches the SVG's viewBox (public/brand/dineinly-logo-dark.svg), cropped
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
			src="/brand/dineinly-logo-dark.svg"
			alt="Dineinly"
			width={width}
			height={height}
			style={{ width, height }}
			priority={priority}
			className={className}
		/>
	);
}

// LogoMark-only and wordmark-only geometry, split from the master lockup
// (public/brand/dineinly-logo-dark.svg) into their own asset files —
// dineinly-logomark-dark.svg and dineinly-wordmark-dark.svg — so the mark
// can animate independently of the wordmark. Same viewBox height (58) and
// y-origin (15) as the master; MARK_WIDTH/WORD_WIDTH/GAP are that file's
// own documented geometry (mark width 22.08, word width 224.08, gap 5.00).
const CANVAS_HEIGHT = 58;
const MARK_WIDTH = 22.08;
const WORD_WIDTH = 224.08;
const GAP = 5;

// The one sanctioned animated wrapper for the logo (docs/design-system.md
// §05/§09): only the logomark animates — the wordmark next to it stays
// static. Mount and hover play the identical full 360° turn around its
// vertical axis (rotateY, base.css) at constant angular velocity — see
// that file for why linear easing (not ease-out) is what actually fixes
// the "flips out, flips back" read, not the rotation axis. Both hover-in
// and hover-out animate via a plain CSS `transition` declared on the
// resting rule, so leaving mid-turn eases back instead of snapping — see
// base.css for the mechanics. Never used for PoweredByDineinly or the footer
// lockup — those stay on the plain, unanimated BrandLogo (single-file
// master asset).
export function AnimatedBrandLogo({
	height,
	priority,
	className,
}: {
	height: number;
	priority?: boolean;
	className?: string;
}) {
	const scale = height / CANVAS_HEIGHT;
	const markWidth = Math.round(MARK_WIDTH * scale);
	const wordWidth = Math.round(WORD_WIDTH * scale);
	const gap = GAP * scale;

	return (
		<span
			className={`brand-logo-group inline-flex items-center ${className ?? ""}`}
			style={{ gap }}
		>
			<span className="brand-logo-mark-anim inline-block">
				<Image
					src="/brand/dineinly-logomark-dark.svg"
					alt=""
					aria-hidden="true"
					width={markWidth}
					height={height}
					style={{ width: markWidth, height }}
					priority={priority}
				/>
			</span>
			<Image
				src="/brand/dineinly-wordmark-dark.svg"
				alt="Dineinly"
				width={wordWidth}
				height={height}
				style={{ width: wordWidth, height }}
				priority={priority}
			/>
		</span>
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
