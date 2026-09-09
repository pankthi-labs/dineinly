import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandWordmark } from "@/components/brand-logo";
import { LegalDocument } from "@/components/legal-document";
import { SiteFooter } from "@/components/site-footer";
import { LEGAL_DOCS } from "@/lib/legal-content";

export function generateStaticParams() {
	return LEGAL_DOCS.map((doc) => ({ slug: doc.slug }));
}

export default async function LegalDocPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const doc = LEGAL_DOCS.find((entry) => entry.slug === slug);
	if (!doc) notFound();

	return (
		<main className="mx-auto flex max-w-(--breakpoint-lg) flex-col px-5 pt-8 pb-16 md:px-8 md:pt-12 md:pb-24">
			<header className="mb-8">
				<Link href="/">
					<BrandWordmark height={32} />
				</Link>
			</header>
			<div className="mb-16 flex flex-col gap-4">
				<LegalDocument markdown={doc.content} />
			</div>
			<SiteFooter variant="compact" />
		</main>
	);
}
