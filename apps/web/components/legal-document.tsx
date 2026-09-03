import { Fragment } from "react";

// Legal docs (docs/legal/*.md) only ever use #/##/###, **bold**, "- " lists,
// and plain-line paragraphs - a full markdown library would be dead weight
// for that. This renders exactly those constructs against design-system
// tokens, nothing more.
function renderInline(text: string) {
	const parts = text.split(/(\*\*.+?\*\*)/g);
	return parts.map((part, index) =>
		part.startsWith("**") && part.endsWith("**") ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
			<strong key={index} className="font-medium text-primary">
				{part.slice(2, -2)}
			</strong>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
			<Fragment key={index}>{part}</Fragment>
		),
	);
}

const HEADING_CLASSES: Record<number, string> = {
	1: "mt-12 text-2xl text-primary first:mt-0 md:text-3xl",
	2: "mt-10 text-xl text-primary",
	3: "mt-6 font-medium text-lg text-primary",
};

export function LegalDocument({ markdown }: { markdown: string }) {
	const blocks = markdown.trim().split(/\n{2,}/);

	return (
		<div className="flex w-full flex-col gap-4">
			{blocks.map((block, index) => {
				const headingMatch = block.match(/^(#{1,3})\s+(.*)$/);
				if (headingMatch) {
					const level = headingMatch[1]?.length ?? 1;
					const Tag = `h${level}` as "h1" | "h2" | "h3";
					return (
						<Tag
							// biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
							key={index}
							className={HEADING_CLASSES[level]}
						>
							{renderInline(headingMatch[2] ?? "")}
						</Tag>
					);
				}

				if (block.startsWith("- ")) {
					const items = block
						.split("\n")
						.map((line) => line.replace(/^-\s+/, ""));
					return (
						<ul
							// biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
							key={index}
							className="flex flex-col gap-1.5 pl-5 text-secondary"
						>
							{items.map((item, itemIndex) => (
								<li
									// biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
									key={itemIndex}
									className="list-disc"
								>
									{renderInline(item)}
								</li>
							))}
						</ul>
					);
				}

				const lines = block.split("\n");
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
					<p key={index} className="text-secondary">
						{lines.map((line, lineIndex) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static content, order never changes
							<Fragment key={lineIndex}>
								{lineIndex > 0 ? <br /> : null}
								{renderInline(line)}
							</Fragment>
						))}
					</p>
				);
			})}
		</div>
	);
}
