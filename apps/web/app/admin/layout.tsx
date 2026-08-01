import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";

// Gates every route under /admin — redirects to /sign-in unless the
// signed-in user carries the Dineinly Admin claim (see lib/auth.ts).
export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	await requireAdmin();

	return children;
}
