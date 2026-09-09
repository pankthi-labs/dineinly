import Image from "next/image";

// Matches the wordmark SVG's viewBox (public/brand/dineinly-wordmark.svg) —
// width is derived from height so every call site renders undistorted
// without repeating the ratio.
const WORDMARK_ASPECT_RATIO = 209.331 / 59.045;

// Inline mirror of public/brand/dineinly-wordmark.svg's glyph paths — kept
// byte-for-byte identical in geometry. Inlined (rather than <Image>) so the
// "d" and each i-dot are DOM nodes CSS can animate independently; update
// both files together if the source glyphs ever change.
//
// Each animated piece is wrapped in its own outer <g> carrying no transform
// or fill of its own — a CSS `animation`/`transition`'s `transform` (or
// `fill`) replaces the SVG attribute of the same name outright rather than
// composing with it, so the original translate/scale/rotate/fill
// attributes stay on an untouched inner element and simply inherit.
function WordmarkGlyphs() {
	return (
		<>
			<g className="brand-wordmark-d-glint">
				<g transform="translate(0 60.16) scale(0.064 -0.064)">
					<path
						fillRule="evenodd"
						d="M199 0 H408 A133 133 0 0 1 541 133 V342 A133 133 0 0 1 408 475 H199 A133 133 0 0 1 66 342 V133 A133 133 0 0 1 199 0 Z M199 90 H408 A43 43 0 0 1 451 133 V342 A43 43 0 0 1 408 385 H199 A43 43 0 0 1 156 342 V133 A43 43 0 0 1 199 90 Z"
					/>
					<path d="M451 0 H541 V694.87 L451 714 Z" />
				</g>
			</g>
			<g fill="#E7EAEE" transform="translate(0 60.16)">
				<g transform="translate(37.9 0) scale(0.064 -0.064)">
					<path d="M67 0 V475 L157 455.87 V0 Z" />
				</g>
				<g transform="translate(51.736 0) scale(0.064 -0.064)">
					<path
						fillRule="evenodd"
						d="M66 0 V355.72 A119.28 119.28 0 0 0 185.28 475 H372.72 A119.28 119.28 0 0 0 492 355.72 V0 H402 V355.72 A29.28 29.28 0 0 1 372.72 385 H185.28 A29.28 29.28 0 0 1 156 355.72 V0 Z"
					/>
				</g>
				<g transform="translate(86.308 0) scale(0.064 -0.064)">
					<path
						fillRule="evenodd"
						d="M33 342 A133 133 0 0 0 166 475 H375 A133 133 0 0 0 508 342 V192.5 H123 V133 A43 43 0 0 1 166 90 H309.565 L290.435 0 H166 A133 133 0 0 0 33 133 Z M123 282.5 H418 V342 A43 43 0 0 1 375 385 H166 A43 43 0 0 1 123 342 V282.5 Z"
					/>
				</g>
				<g transform="translate(120.112 0) scale(0.064 -0.064)">
					<path d="M67 0 V475 L157 455.87 V0 Z" />
				</g>
				<g transform="translate(133.948 0) scale(0.064 -0.064)">
					<path
						fillRule="evenodd"
						d="M66 0 V355.72 A119.28 119.28 0 0 0 185.28 475 H372.72 A119.28 119.28 0 0 0 492 355.72 V0 H402 V355.72 A29.28 29.28 0 0 1 372.72 385 H185.28 A29.28 29.28 0 0 1 156 355.72 V0 Z"
					/>
				</g>
				<g transform="translate(168.52 0) scale(0.064 -0.064)">
					<path d="M66 0H156V694.87L66 714Z" />
				</g>
				<g transform="translate(182.228 0) scale(0.064 -0.064)">
					<path d="M399.48 475 L489.48 455.87 L193.66 -208.57 L103.66 -189.44 Z M24.52 455.87 L114.52 475 L306.26 44.34 L207.74 44.34 Z" />
				</g>
			</g>
			<g fill="#E7EAEE">
				<g className="brand-wordmark-dot-pulse">
					<rect
						x="41.9"
						y="18.24"
						width="6.336"
						height="6.336"
						rx="1.77408"
						transform="rotate(12 45.068 21.408)"
					/>
				</g>
				<g className="brand-wordmark-dot-pulse">
					<rect
						x="124.112"
						y="18.24"
						width="6.336"
						height="6.336"
						rx="1.77408"
						transform="rotate(12 127.28 21.408)"
					/>
				</g>
			</g>
		</>
	);
}

// The one wordmark component (docs/design-system.md §09) for every header,
// sign-in screen, and standalone brand placement. The mark never appears
// next to it — the identity's own usage rule bans that pairing. Glint/pulse
// animation timing and rationale: base.css (`.brand-wordmark-d-glint`,
// `.brand-wordmark-dot-pulse`). `overflow: visible` on the root matters
// here: the SVG's viewBox is tight to ink with zero headroom, so without it
// any scale-up clips against the box edge.
export function BrandWordmark({
	height,
	className,
}: {
	height: number;
	className?: string;
}) {
	const width = Math.round(height * WORDMARK_ASPECT_RATIO);
	return (
		<svg
			viewBox="4.224 14.464 209.331 59.045"
			width={width}
			height={height}
			style={{ width, height, overflow: "visible" }}
			role="img"
			aria-label="Dineinly"
			className={`brand-wordmark ${className ?? ""}`}
		>
			<WordmarkGlyphs />
		</svg>
	);
}

// Plain, unanimated wordmark — the file asset via next/image, no inline
// glyphs. The only consumer is PoweredByDineinly below: docs/design-system.md
// §09 is explicit that the logo never animates there.
function StaticBrandWordmark({
	height,
	className,
}: {
	height: number;
	className?: string;
}) {
	const width = Math.round(height * WORDMARK_ASPECT_RATIO);
	return (
		<Image
			src="/brand/dineinly-wordmark.svg"
			alt="Dineinly"
			width={width}
			height={height}
			style={{ width, height }}
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
			<StaticBrandWordmark height={12} className="translate-y-px" />
		</div>
	);
}
