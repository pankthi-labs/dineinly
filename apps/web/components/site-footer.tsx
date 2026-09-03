import Link from "next/link";

// The one standard public-page footer - home, /legal, and every legal doc
// page render this exact block, never a breadcrumb or back-link instead.
export function SiteFooter() {
	return (
		<footer className="flex flex-col gap-4 border-divider border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
			<p className="text-muted text-xs">
				© {new Date().getFullYear()} Dineinly. All rights reserved.
			</p>
			<nav className="flex gap-5">
				<Link
					href="/legal/privacy"
					className="text-muted text-xs hover:text-secondary"
				>
					Privacy Policy
				</Link>
				<Link
					href="/legal/terms"
					className="text-muted text-xs hover:text-secondary"
				>
					Terms of Service
				</Link>
				<Link
					href="/legal/copyright"
					className="text-muted text-xs hover:text-secondary"
				>
					Copyright
				</Link>
			</nav>
		</footer>
	);
}
