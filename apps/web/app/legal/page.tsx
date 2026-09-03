import Link from "next/link";
import { AnimatedBrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";
import { LEGAL_DOCS } from "@/lib/legal-content";

export default function LegalIndexPage() {
	return (
		<main className="mx-auto flex max-w-(--breakpoint-lg) flex-col px-5 pt-8 pb-16 md:px-8 md:pt-12 md:pb-24">
			<header className="mb-8">
				<Link href="/">
					<AnimatedBrandLogo height={32} priority />
				</Link>
			</header>
			<div className="mb-16 flex flex-col gap-8">
				<h1 className="text-3xl text-primary">Legal</h1>
				<ul className="flex flex-col divide-y divide-divider rounded-xl border border-divider">
					{LEGAL_DOCS.map((doc) => (
						<li key={doc.slug}>
							<Link
								href={`/legal/${doc.slug}`}
								className="flex flex-col gap-1 p-5 transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated"
							>
								<span className="font-medium text-primary">{doc.title}</span>
								<span className="text-secondary text-sm">
									{doc.description}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</div>
			<SiteFooter />
		</main>
	);
}
