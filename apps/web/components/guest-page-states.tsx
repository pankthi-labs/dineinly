// Loading/error/no-session states shared by the three guest pages (menu,
// cart, orders) — identical chrome, only the copy differs per page.
export function GuestLoading({ message }: { message: string }) {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-background px-5 text-primary">
			<p className="text-muted">{message}</p>
		</main>
	);
}

// Renders before any guest session exists — the restaurant's experience
// (table-based, tableless, or Menu's view-only QR) isn't known yet, so this
// copy stays experience-neutral. Never say "table": Dineinly Menu and
// Dineinly Counter guests have none.
export function NoGuestSession() {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-background px-5 text-center text-primary">
			<div>
				<p className="text-caps text-muted">No session found</p>
				<h1 className="mt-3 text-2xl">Scan the QR code to continue.</h1>
			</div>
		</main>
	);
}

export function GuestError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-background px-5 text-center text-primary">
			<div>
				<p className="text-caps text-muted">Something went wrong</p>
				<h1 className="mt-3 text-2xl">{message}</h1>
				<button
					type="button"
					onClick={onRetry}
					className="mt-6 rounded-md bg-accent px-6 py-3 font-medium text-background text-sm"
				>
					Try again
				</button>
			</div>
		</main>
	);
}
