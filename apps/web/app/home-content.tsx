"use client";

// Marketing-page exception (docs/design-system.md §09): this is the only
// file in the app permitted to import `motion` (MIT, the framer-motion
// successor). No other route may adopt it - the rest of the product uses
// CSS-only motion per §05.
import {
	Check,
	ChefHat,
	ClipboardList,
	ConciergeBell,
	Crown,
	LogIn,
	QrCode,
	Radio,
	Receipt,
	Smartphone,
	Sparkles,
	User,
	UtensilsCrossed,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { AnimatedBrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/site-footer";

// Scroll-in reveal shared by every section below. `initial: false` under
// reduced motion skips the offset entirely, so the element renders at rest.
function fadeUp(delaySeconds: number, reduceMotion: boolean | null) {
	return {
		initial: reduceMotion ? false : { opacity: 0, y: 32, scale: 0.97 },
		whileInView: { opacity: 1, y: 0, scale: 1 },
		viewport: { once: true, amount: 0.3 },
		transition: {
			duration: 0.7,
			delay: reduceMotion ? 0 : delaySeconds,
			ease: "easeOut" as const,
		},
	};
}

// The four stops of a Dineinly order, shown along the flow line below.
// Guest-facing labels only - no internal/technical naming (QR, scan, etc.).
const LOOP_PHASES = [
	{
		icon: QrCode,
		label: "Menu",
		description: "One QR code opens the full menu. No app to install.",
	},
	{
		icon: ClipboardList,
		label: "Orders",
		description: "Every order reaches the kitchen the moment it’s placed.",
	},
	{
		icon: ChefHat,
		label: "Kitchen",
		description: "A live queue that stays perfectly in sync.",
	},
	{
		icon: Receipt,
		label: "Bills",
		description: "Every bill, ready the moment it’s requested.",
	},
] as const;

// A floating card, not a cramped tooltip: label + description, revealed on
// hover with a pronounced rise. Glass surface (§01, popover-weight shadow
// per §12) instead of a flat card, and the emphasized easing §05 reserves
// for "tactile luxury" reveals (Bottom Sheet/Side Dock) rather than a plain
// ease-out - see the §09 sign-off for both reuses. Shared by every node
// below.
const NODE_CARD_CLASSES =
	"glass pointer-events-none absolute bottom-full left-1/2 z-(--z-tooltip) mb-4 w-[14rem] -translate-x-1/2 translate-y-2 scale-95 rounded-xl p-5 text-left opacity-0 shadow-md transition-all duration-(--duration-base) ease-emphasized group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100";

// §05's own documented curve for a "tactile luxury feel" (Bottom Sheet/Side
// Dock open) - reused here so the flow's entrance settles with the same
// deceleration instead of framer-motion's generic "easeOut".
const EASE_EMPHASIZED: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Seconds for the connecting line to draw left to right on scroll-in. Each
// node's own reveal is timed to the instant the line reaches it
// (index / (count - 1) of this duration), so the "highlight" travels with
// the line instead of staggering independently of it.
const LINE_DRAW_SECONDS = 0.75;

function DineinlyLoop({ reduceMotion }: { reduceMotion: boolean | null }) {
	return (
		<motion.section
			{...fadeUp(0.1, reduceMotion)}
			className="mb-16 flex flex-col items-center gap-12"
		>
			<div className="flex flex-col items-center gap-3 text-center">
				<h2 className="text-balance font-medium text-3xl md:text-4xl">
					Four moments. One live system.
				</h2>
				<p className="max-w-[36ch] text-balance text-secondary">
					Menu, orders, kitchen, and bills - everything works together, so the
					entire dining experience moves effortlessly from start to finish.
				</p>
			</div>
			<div className="relative flex w-full max-w-2xl items-start justify-between">
				<motion.div
					className="pointer-events-none absolute top-[1.375rem] right-[1.375rem] left-[1.375rem] z-(--z-base) h-px origin-left bg-divider"
					initial={{ scaleX: 0 }}
					whileInView={{ scaleX: 1 }}
					viewport={{ once: true, amount: 0.6 }}
					transition={{ duration: LINE_DRAW_SECONDS, ease: "easeInOut" }}
				/>
				{LOOP_PHASES.map(({ icon: Icon, label, description }, index) => {
					const arrivalDelay =
						(index / (LOOP_PHASES.length - 1)) * LINE_DRAW_SECONDS;
					return (
						<motion.div
							key={label}
							className="group relative z-(--z-sticky) flex flex-col items-center gap-3"
							initial={{ opacity: 0.25, y: 12 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true, amount: 0.6 }}
							transition={{
								duration: 0.4,
								delay: arrivalDelay,
								ease: EASE_EMPHASIZED,
							}}
						>
							<div className={NODE_CARD_CLASSES}>
								<p className="font-medium text-base text-primary tracking-tight">
									{label}
								</p>
								<p className="mt-1.5 text-secondary text-xs leading-relaxed">
									{description}
								</p>
							</div>
							<div className="relative">
								<motion.span
									className="pointer-events-none absolute inset-[-0.4rem] rounded-full border border-accent/60"
									initial={{ opacity: 1, scale: 0.6 }}
									whileInView={{ opacity: 0, scale: 1.5 }}
									viewport={{ once: true, amount: 0.6 }}
									transition={{
										duration: 0.6,
										delay: arrivalDelay,
										ease: "easeOut",
									}}
								/>
								<div className="flex size-[2.75rem] items-center justify-center rounded-full border border-accent/40 bg-background text-accent transition-all duration-(--duration-base) ease-emphasized group-hover:scale-110 group-hover:border-accent">
									<Icon
										className="icon-sm"
										strokeWidth={1.5}
										aria-hidden="true"
									/>
								</div>
							</div>
							<span className="text-caps text-muted">{label}</span>
						</motion.div>
					);
				})}
			</div>
		</motion.section>
	);
}

const TRACKS = [
	{
		key: "full-service",
		friendlyName: "Table Service",
		timing: "Pay after the meal",
		blurb:
			"Order first. Settle once the meal is done - the way great table service has always worked.",
		packages: [
			{
				name: "Dineinly Menu",
				icon: QrCode,
				inheritsFrom: null,
				description: "Your table's menu, ready to order.",
				features: [
					"Scan the QR at your table",
					"Browse menu directly from your phone",
					"Live prices, items, and availability",
					"No app or account required",
				],
			},
			{
				name: "Dineinly Guest",
				icon: User,
				inheritsFrom: "Dineinly Menu",
				features: [
					"Guests order directly from their phones",
					"Order requests go straight to your team",
				],
			},
			{
				name: "Dineinly One",
				icon: Crown,
				featured: true,
				inheritsFrom: "Dineinly Guest",
				features: [
					"Orders go straight to the kitchen",
					"Live kitchen queue",
					"Real-time order status",
					"Bill management",
				],
			},
		],
	},
	{
		key: "quick-service",
		friendlyName: "Counter Service",
		timing: "Pay before the meal",
		blurb:
			"Guests pay first. The kitchen starts once payment is confirmed - built to keep the line moving.",
		packages: [
			{
				name: "Dineinly Menu",
				icon: QrCode,
				inheritsFrom: null,
				description: "The menu, ready wherever you are.",
				features: [
					"One QR code for everyone visiting the restaurant",
					"Browse the full menu before ordering at the counter",
					"Live prices, items, and availability",
					"No app or account required",
				],
			},
			{
				name: "Dineinly Counter",
				icon: ConciergeBell,
				inheritsFrom: "Dineinly Menu",
				features: [
					"Guests order directly from their phone",
					"Instant token, ready to show at the counter",
					"Bill and token management",
					"Guests send items to the kitchen instantly, once payment is confirmed",
					"Ready-for-pickup notifications",
				],
			},
		],
	},
];

const PRINCIPLES = [
	{
		icon: Radio,
		title: "Live, always.",
		body: "The moment something changes, everyone sees it. No refresh. No relay. No waiting.",
	},
	{
		icon: UtensilsCrossed,
		title: "Made for the guest.",
		body: "Technology disappears into the experience. No app. No account. No instructions. Just a simpler way to dine.",
	},
	{
		icon: Sparkles,
		title: "Quiet by design.",
		body: "Premium feels calm. Nothing should feel like software.",
	},
	{
		icon: Smartphone,
		title: "Built for the hand.",
		body: "Every guest and floor interaction is designed for the phone already in your hand.",
	},
];

export function HomeContent() {
	const reduceMotion = useReducedMotion();

	return (
		<main className="mx-auto flex max-w-(--breakpoint-lg) flex-col px-5 pt-8 pb-16 md:px-8 md:pt-12 md:pb-24">
			<motion.header
				initial={reduceMotion ? false : { opacity: 0, y: -16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.6, ease: "easeOut" }}
				className="mb-8 flex items-center justify-between"
			>
				<AnimatedBrandLogo height={40} priority />
				<motion.div
					whileHover={{ y: -2 }}
					whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
				>
					<Link
						href="/sign-in"
						className="flex items-center gap-2 rounded-md border border-divider px-4 py-2 font-medium text-secondary text-sm no-underline transition-colors duration-(--duration-base) ease-out hover:border-primary/40 hover:bg-surface-elevated hover:text-primary"
					>
						<LogIn className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
						Staff sign in
					</Link>
				</motion.div>
			</motion.header>

			<section className="mb-16 flex flex-col items-center gap-6 text-center">
				<motion.h1
					initial={reduceMotion ? false : { opacity: 0, y: 36, scale: 0.98 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={{
						duration: 0.8,
						delay: reduceMotion ? 0 : 0.1,
						ease: "easeOut",
					}}
					className="max-w-[16ch] text-balance text-4xl md:text-6xl"
				>
					The dining experience, beautifully connected.
				</motion.h1>
				<motion.p
					initial={reduceMotion ? false : { opacity: 0, y: 28 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{
						duration: 0.7,
						delay: reduceMotion ? 0 : 0.3,
						ease: "easeOut",
					}}
					className="prose text-balance text-lg text-secondary"
				>
					Guests order. Your team serves. The kitchen moves. Everyone stays in
					sync - from the first scan to the final bill.
				</motion.p>
			</section>

			<DineinlyLoop reduceMotion={reduceMotion} />

			<motion.section
				{...fadeUp(0, reduceMotion)}
				className="mb-16 flex flex-col gap-10"
			>
				<div className="flex flex-col items-center gap-3 text-center">
					<h2 className="font-medium text-3xl text-accent tracking-tight md:text-4xl">
						Dineinly Experiences
					</h2>
					<p className="max-w-[22ch] text-balance font-medium text-primary text-xl md:text-2xl">
						Packages built around how you serve.
					</p>
					<p className="prose text-balance text-secondary">
						Every restaurant answers one simple question: do guests pay before
						food is prepared, or after the meal? Dineinly gives you the
						experience that fits.
					</p>
				</div>

				<motion.div
					{...fadeUp(0.1, reduceMotion)}
					className="grid items-start gap-6 md:grid-cols-2"
				>
					{TRACKS.map((track) => (
						<div
							key={track.key}
							className="flex flex-col gap-6 rounded-3xl border border-divider bg-surface p-6 transition-colors duration-(--duration-base) ease-out hover:border-accent/40 md:p-8"
						>
							<div className="flex flex-col gap-3">
								<div className="flex items-baseline justify-between">
									<span className="font-medium text-primary text-xl">
										{track.friendlyName}
									</span>
									<span className="rounded-pill bg-surface-elevated px-3 py-1 text-caps text-secondary">
										{track.timing}
									</span>
								</div>
								<p className="text-secondary text-sm">{track.blurb}</p>
							</div>
							<div className="flex flex-col gap-3">
								{track.packages.map((pkg) => {
									const Icon = pkg.icon;
									return (
										<div
											key={pkg.name}
											className="flex flex-col gap-3 rounded-xl bg-surface-elevated p-4 transition-colors duration-(--duration-base) ease-out hover:bg-surface-raised"
										>
											<div className="flex flex-col gap-1">
												<div className="flex items-center gap-2">
													<Icon
														className={`${pkg.featured ? "icon-lg" : "icon-md"} text-accent`}
														strokeWidth={1.5}
														aria-hidden="true"
													/>
													<p className="font-medium text-lg text-primary">
														{pkg.name}
													</p>
												</div>
												{pkg.inheritsFrom ? (
													<p className="text-caps text-muted">
														Everything in {pkg.inheritsFrom}, plus
													</p>
												) : (
													<p className="text-secondary text-sm">
														{pkg.description}
													</p>
												)}
											</div>
											<ul className="flex flex-col gap-1.5">
												{pkg.features.map((feature) => (
													<li key={feature} className="flex items-start gap-2">
														<Check
															className="icon-sm mt-0.5 shrink-0 text-accent-secondary"
															strokeWidth={1.5}
															aria-hidden="true"
														/>
														<span className="font-medium text-secondary text-sm">
															{feature}
														</span>
													</li>
												))}
											</ul>
										</div>
									);
								})}
							</div>
						</div>
					))}
				</motion.div>
			</motion.section>

			<motion.section
				{...fadeUp(0, reduceMotion)}
				className="mb-16 flex flex-col gap-10"
			>
				<h2 className="mx-auto max-w-[20ch] text-balance text-center text-3xl md:text-4xl">
					Simple for guests. Powerful for restaurants.
				</h2>
				<div className="grid gap-8 sm:grid-cols-2">
					{PRINCIPLES.map(({ icon: Icon, title, body }, index) => (
						<motion.div
							key={title}
							{...fadeUp(index * 0.08, reduceMotion)}
							className="flex gap-4"
						>
							<motion.div whileHover={{ scale: 1.1 }}>
								<Icon
									className="icon-lg shrink-0 text-accent"
									strokeWidth={1.5}
								/>
							</motion.div>
							<div className="flex flex-col gap-1">
								<p className="font-medium text-primary">{title}</p>
								<p className="text-secondary text-sm">{body}</p>
							</div>
						</motion.div>
					))}
				</div>
			</motion.section>

			<SiteFooter variant="public" />
		</main>
	);
}
