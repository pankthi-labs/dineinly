"use client";

import { createContext, type ReactNode, useContext } from "react";

const IsAdminContext = createContext<boolean | null>(null);

export function RestaurantViewerProvider({
	isAdmin,
	children,
}: {
	isAdmin: boolean;
	children: ReactNode;
}) {
	return (
		<IsAdminContext.Provider value={isAdmin}>
			{children}
		</IsAdminContext.Provider>
	);
}

export function useIsAdmin(): boolean {
	const isAdmin = useContext(IsAdminContext);
	if (isAdmin === null) {
		throw new Error("useIsAdmin must be used within RestaurantViewerProvider");
	}
	return isAdmin;
}
