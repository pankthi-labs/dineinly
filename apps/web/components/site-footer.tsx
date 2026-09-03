import Link from "next/link";

const LINK_CLASS = "text-muted text-xs hover:text-secondary";

// The footer every page renders (docs/design-system.md § 09 — every page has
// a header and a footer, Kitchen Display excepted). `variant` has no default
// on purpose — every call site must choose: "public" (the three-link spread)
// is home.tsx only; every other page, /legal/[slug] included, is "compact"
// (single "Legal" link). The /legal index page renders neither — its own
// content already is the three links, so a footer repeating them is
// redundant.
export function SiteFooter({
	variant,
	className = "",
}: {
	variant: "public" | "compact";
	className?: string;
}) {
	return (
		<footer
			className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-divider border-t pt-8 ${className}`}
		>
			<p className="text-muted text-xs">
				© {new Date().getFullYear()} Dineinly. All rights reserved.
			</p>
			<nav className="flex flex-wrap gap-5">
				{variant === "public" ? (
					<>
						<Link href="/legal/privacy" className={LINK_CLASS}>
							Privacy Policy
						</Link>
						<Link href="/legal/terms" className={LINK_CLASS}>
							Terms of Service
						</Link>
						<Link href="/legal/copyright" className={LINK_CLASS}>
							Copyright
						</Link>
					</>
				) : (
					<Link href="/legal" className={LINK_CLASS}>
						Legal
					</Link>
				)}
			</nav>
		</footer>
	);
}
