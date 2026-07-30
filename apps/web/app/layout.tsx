import "@workspace/ui/globals.css";
import { TRPCProvider } from "@/lib/trpc-client";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>
				<TRPCProvider>{children}</TRPCProvider>
			</body>
		</html>
	);
}
