"use client";

import { ArrowLeftFromLine, LogOut, MoreVertical, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const menuItemClass =
	"flex items-center gap-3 px-4 py-3 text-left text-secondary text-sm no-underline transition-colors duration-(--duration-base) ease-out hover:bg-surface-elevated hover:text-primary focus-visible:bg-surface-elevated focus-visible:text-primary";

/**
 * One "More" dropdown for every header utility action — Restaurants
 * Directory (Dineinly Admin viewing a restaurant only), Profile (admin home
 * dashboard only), Log out (always) — instead of a row of separate icon
 * buttons. Keeps the header's own space for the restaurant/brand name and
 * the full nav bar; extensible for whatever gets added here next
 * (Notifications, Settings, ...) without widening the header further.
 */
export function AdminHeaderActions({
	showProfile = false,
	directoryHref,
}: {
	showProfile?: boolean;
	directoryHref?: string;
}) {
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	// Closes and, unless the close came from a pointer click (the mouse
	// already sits where it needs to be), returns focus to the trigger —
	// matches every other dismissable surface in the app
	// (use-dismissable-overlay.ts's own focus-restore-on-close).
	function close(restoreFocus: boolean) {
		setIsOpen(false);
		if (restoreFocus) triggerRef.current?.focus();
	}

	useEffect(() => {
		if (!isOpen) return;
		function handlePointerDown(event: PointerEvent) {
			if (!containerRef.current?.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setIsOpen(false);
				triggerRef.current?.focus();
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	async function handleLogOut() {
		const supabase = createClient();
		await supabase.auth.signOut();
		router.replace("/sign-in");
	}

	return (
		<div ref={containerRef} className="relative">
			<button
				ref={triggerRef}
				type="button"
				title="More actions"
				aria-label="More actions"
				aria-expanded={isOpen}
				onClick={() => setIsOpen((current) => !current)}
				className="icon-tap-target flex items-center justify-center text-secondary transition-colors duration-(--duration-base) ease-out hover:text-primary focus-visible:text-primary"
			>
				<MoreVertical
					className="icon-sm"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
			</button>

			{isOpen ? (
				<div className="absolute top-full right-0 z-(--z-dropdown) mt-2 flex w-max flex-col overflow-hidden whitespace-nowrap rounded-md border border-divider bg-surface shadow-(--shadow-sm)">
					{directoryHref ? (
						<Link
							href={directoryHref}
							className={menuItemClass}
							onClick={() => close(false)}
						>
							<ArrowLeftFromLine
								className="icon-sm"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							Restaurants Directory
						</Link>
					) : null}
					{showProfile ? (
						<button
							type="button"
							className={menuItemClass}
							onClick={() => close(false)}
						>
							<User className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
							Profile
						</button>
					) : null}
					<button
						type="button"
						className={menuItemClass}
						onClick={handleLogOut}
					>
						<LogOut className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
						Log out
					</button>
				</div>
			) : null}
		</div>
	);
}
