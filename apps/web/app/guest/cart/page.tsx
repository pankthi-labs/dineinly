"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { GuestPageHeader } from "@/components/guest-page-header";
import {
	GuestError,
	GuestLoading,
	NoGuestSession,
} from "@/components/guest-page-states";
import { QuantityPill } from "@/components/quantity-pill";
import { formatPrice, titleCase } from "@/lib/format";
import { ICE_LABELS } from "@/lib/menu-options";
import { trpc } from "@/lib/trpc-client";

// Confirm Order screen — reached from the guest menu's "Review Order" bar
// (app/guest/menu/page.tsx). Same phone-only assumption (docs/design-system.md
// § 10) and same "no session" / "menu unavailable" states as the menu page,
// since both read the guest's session through the same cookie.
export default function GuestCartPage() {
	const menu = trpc.guest.menu.useQuery(undefined, { retry: false });
	const cart = trpc.guest.cart.list.useQuery(undefined, {
		enabled: menu.isSuccess,
	});
	const utils = trpc.useUtils();
	const setQuantity = trpc.guest.cart.setQuantity.useMutation({
		onSuccess: () => utils.guest.cart.list.invalidate(),
	});
	const removeItem = trpc.guest.cart.removeItem.useMutation({
		onSuccess: () => utils.guest.cart.list.invalidate(),
	});
	// One key per visit to this screen — reused across retries of the same
	// confirm attempt so a duplicate tap or a network retry lands on the same
	// order instead of creating a second one (submit_order is keyed on this).
	const [idempotencyKey] = useState(() => crypto.randomUUID());
	const [submitError, setSubmitError] = useState<string | null>(null);

	if (menu.isLoading || (menu.isSuccess && cart.isLoading)) {
		return <GuestLoading message="Loading your order…" />;
	}
	if (menu.error?.data?.code === "UNAUTHORIZED") return <NoGuestSession />;
	if (menu.error || !menu.data) {
		return (
			<GuestError
				message="We couldn't load your order."
				onRetry={() => menu.refetch()}
			/>
		);
	}

	return (
		<GuestCartContent
			restaurantName={menu.data.restaurant.name}
			tableLabel={menu.data.tableLabel}
			items={cart.data ?? []}
			idempotencyKey={idempotencyKey}
			submitError={submitError}
			setSubmitError={setSubmitError}
			onDecrement={(item) =>
				setQuantity.mutate({ cartItemId: item.id, quantity: item.quantity - 1 })
			}
			onIncrement={(item) =>
				setQuantity.mutate({ cartItemId: item.id, quantity: item.quantity + 1 })
			}
			onRemove={(item) => removeItem.mutate({ cartItemId: item.id })}
		/>
	);
}

type CartLine = {
	id: string;
	menuItemId: string;
	name: string;
	price: number;
	quantity: number;
	spice: string | null;
	salt: string | null;
	ice: string | null;
	available: boolean;
};

function preferenceNotes(item: CartLine): string[] {
	const notes: string[] = [];
	if (item.spice && item.spice !== "regular") notes.push(titleCase(item.spice));
	if (item.salt && item.salt !== "regular") notes.push(titleCase(item.salt));
	if (item.ice && item.ice !== "regular") {
		notes.push(ICE_LABELS[item.ice as keyof typeof ICE_LABELS] ?? item.ice);
	}
	return notes;
}

function GuestCartContent({
	restaurantName,
	tableLabel,
	items,
	idempotencyKey,
	submitError,
	setSubmitError,
	onDecrement,
	onIncrement,
	onRemove,
}: {
	restaurantName: string;
	tableLabel: string;
	items: CartLine[];
	idempotencyKey: string;
	submitError: string | null;
	setSubmitError: (message: string | null) => void;
	onDecrement: (item: CartLine) => void;
	onIncrement: (item: CartLine) => void;
	onRemove: (item: CartLine) => void;
}) {
	const router = useRouter();
	const utils = trpc.useUtils();
	const submitOrder = trpc.guest.submitOrder.useMutation({
		onSuccess: () => {
			utils.guest.cart.list.invalidate();
			router.push("/guest/orders");
		},
		onError: (error) => setSubmitError(error.message),
	});

	const total = useMemo(
		() => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
		[items],
	);
	const hasUnavailableItem = items.some((item) => !item.available);

	return (
		<div className="min-h-dvh bg-background text-primary">
			<GuestPageHeader
				restaurantName={restaurantName}
				tableLabel={tableLabel}
			/>

			<main className="px-5 pt-4 pb-24">
				<button
					type="button"
					onClick={() => router.push("/guest/menu")}
					className="flex items-center gap-1 text-secondary text-sm transition-colors duration-(--duration-base) ease-out hover:text-primary"
				>
					<ArrowLeft className="icon-sm" strokeWidth={1.5} aria-hidden="true" />
					Menu
				</button>
				<h2 className="mt-4 text-caps text-secondary">Review Order</h2>

				{items.length === 0 ? (
					<p className="mt-8 text-center text-muted">
						Your cart is empty. Head back to the menu to add something.
					</p>
				) : (
					<div className="mt-6 flex flex-col">
						{items.map((item) => {
							const notes = preferenceNotes(item);
							return (
								<div key={item.id} className="border-divider border-b py-5">
									<div className="flex items-center justify-between gap-4">
										<h3 className="min-w-0 flex-1 text-lg text-primary">
											{titleCase(item.name)}
											{!item.available ? (
												<span className="ml-2 text-error text-sm">
													No longer available
												</span>
											) : null}
										</h3>
										<QuantityPill
											value={item.quantity}
											onDecrement={() => onDecrement(item)}
											onIncrement={() => onIncrement(item)}
										/>
									</div>
									<div className="mt-1 flex items-center justify-between gap-4">
										<p className="text-secondary text-sm">
											{notes.length > 0 ? notes.join(", ") : null}
										</p>
										<button
											type="button"
											onClick={() => onRemove(item)}
											className="shrink-0 text-caps text-muted hover:text-primary"
										>
											Remove
										</button>
									</div>
								</div>
							);
						})}
						<div className="flex items-center justify-between gap-4 pt-5">
							<span className="text-lg text-primary">Total</span>
							<span className="text-accent text-lg">{formatPrice(total)}</span>
						</div>
					</div>
				)}
			</main>

			{items.length > 0 ? (
				<div className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-divider border-t bg-surface-elevated px-5 py-4">
					{submitError ? (
						<p className="mt-3 text-center text-error text-sm">{submitError}</p>
					) : null}
					<button
						type="button"
						disabled={
							submitOrder.isPending || hasUnavailableItem || items.length === 0
						}
						onClick={() => {
							setSubmitError(null);
							submitOrder.mutate({ idempotencyKey });
						}}
						className="mt-3 w-full rounded-md bg-accent px-6 py-4 font-medium text-background text-sm disabled:cursor-not-allowed disabled:opacity-60"
					>
						{submitOrder.isPending ? "Sending…" : "Confirm Order"}
					</button>
				</div>
			) : null}
		</div>
	);
}
