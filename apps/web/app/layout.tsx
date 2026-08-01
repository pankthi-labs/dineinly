import "@workspace/ui/globals.css";
import { Inter, Outfit } from "next/font/google";
import { TRPCProvider } from "@/lib/trpc-client";

// docs/design-system.md §02 — Outfit (display) + Inter (UI) only, self-hosted
// via next/font (no Google Fonts CSS import, no system-ui fallback in prod).
const outfit = Outfit({
	subsets: ["latin"],
	variable: "--font-outfit",
	display: "swap",
});

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${outfit.variable} ${inter.variable}`}>
			<body>
				<TRPCProvider>{children}</TRPCProvider>
			</body>
		</html>
	);
}
