import { relations } from "drizzle-orm";
import { bills } from "./bill.js";
import { cartItems } from "./cart-item.js";
import { menuCategories } from "./menu-category.js";
import { menuItems } from "./menu-item.js";
import { menuLabels } from "./menu-label.js";
import { orders } from "./order.js";
import { orderItems } from "./order-item.js";
import { restaurants } from "./restaurant.js";
import { restaurantTables } from "./restaurant-table.js";
import { sessions } from "./session.js";
import { staff } from "./staff.js";
import { stationDevices } from "./station-device.js";
import { stationPairingCodes } from "./station-pairing-code.js";

export const restaurantsRelations = relations(restaurants, ({ many }) => ({
	staff: many(staff),
	sessions: many(sessions),
	restaurantTables: many(restaurantTables),
	menuCategories: many(menuCategories),
	menuItems: many(menuItems),
	menuLabels: many(menuLabels),
	cartItems: many(cartItems),
	orders: many(orders),
	orderItems: many(orderItems),
	bills: many(bills),
	stationPairingCodes: many(stationPairingCodes),
	stationDevices: many(stationDevices),
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
	restaurant: one(restaurants, {
		fields: [staff.restaurantId],
		references: [restaurants.id],
	}),
	cartItemsAdded: many(cartItems),
	ordersPlaced: many(orders),
	billsSettled: many(bills),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
	restaurant: one(restaurants, {
		fields: [sessions.restaurantId],
		references: [restaurants.id],
	}),
	restaurantTables: many(restaurantTables),
	cartItems: many(cartItems),
	orders: many(orders),
	bills: many(bills),
}));

export const restaurantTablesRelations = relations(
	restaurantTables,
	({ one }) => ({
		restaurant: one(restaurants, {
			fields: [restaurantTables.restaurantId],
			references: [restaurants.id],
		}),
		session: one(sessions, {
			fields: [restaurantTables.sessionId],
			references: [sessions.id],
		}),
	}),
);

export const menuCategoriesRelations = relations(
	menuCategories,
	({ one, many }) => ({
		restaurant: one(restaurants, {
			fields: [menuCategories.restaurantId],
			references: [restaurants.id],
		}),
		menuItems: many(menuItems),
	}),
);

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
	restaurant: one(restaurants, {
		fields: [menuItems.restaurantId],
		references: [restaurants.id],
	}),
	category: one(menuCategories, {
		fields: [menuItems.categoryId],
		references: [menuCategories.id],
	}),
}));

export const menuLabelsRelations = relations(menuLabels, ({ one }) => ({
	restaurant: one(restaurants, {
		fields: [menuLabels.restaurantId],
		references: [restaurants.id],
	}),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
	restaurant: one(restaurants, {
		fields: [cartItems.restaurantId],
		references: [restaurants.id],
	}),
	session: one(sessions, {
		fields: [cartItems.sessionId],
		references: [sessions.id],
	}),
	menuItem: one(menuItems, {
		fields: [cartItems.menuItemId],
		references: [menuItems.id],
	}),
	addedByStaff: one(staff, {
		fields: [cartItems.addedByStaffId],
		references: [staff.id],
	}),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
	restaurant: one(restaurants, {
		fields: [orders.restaurantId],
		references: [restaurants.id],
	}),
	session: one(sessions, {
		fields: [orders.sessionId],
		references: [sessions.id],
	}),
	bill: one(bills, {
		fields: [orders.billId],
		references: [bills.id],
	}),
	placedByStaff: one(staff, {
		fields: [orders.placedByStaffId],
		references: [staff.id],
	}),
	orderItems: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
	restaurant: one(restaurants, {
		fields: [orderItems.restaurantId],
		references: [restaurants.id],
	}),
	order: one(orders, {
		fields: [orderItems.orderId],
		references: [orders.id],
	}),
	menuItem: one(menuItems, {
		fields: [orderItems.menuItemId],
		references: [menuItems.id],
	}),
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
	restaurant: one(restaurants, {
		fields: [bills.restaurantId],
		references: [restaurants.id],
	}),
	session: one(sessions, {
		fields: [bills.sessionId],
		references: [sessions.id],
	}),
	orders: many(orders),
	settledByStaff: one(staff, {
		fields: [bills.settledBy],
		references: [staff.id],
	}),
}));

export const stationPairingCodesRelations = relations(
	stationPairingCodes,
	({ one }) => ({
		restaurant: one(restaurants, {
			fields: [stationPairingCodes.restaurantId],
			references: [restaurants.id],
		}),
	}),
);

export const stationDevicesRelations = relations(stationDevices, ({ one }) => ({
	restaurant: one(restaurants, {
		fields: [stationDevices.restaurantId],
		references: [restaurants.id],
	}),
}));
