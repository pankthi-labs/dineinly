import { z } from "zod";
import { PIN_PATTERN } from "./staff.schema";

const restaurantIdSchema = z.string().uuid();

export const pairingCodePattern = /^\d{6}$/;

export const stationTypeSchema = z.enum(["waiter"]);

export const generatePairingCodeInput = z.object({
	restaurantId: restaurantIdSchema,
	stationType: stationTypeSchema,
});

export const redeemPairingCodeInput = z.object({
	code: z.string().trim().regex(pairingCodePattern, "Code must be 6 digits"),
});

// Shared with the PIN pad component so both validate identically off one
// pattern — same relationship staff.schema.ts's PIN_PATTERN has with
// profile-sheet.tsx.
export const verifyPinInput = z.object({
	restaurantId: restaurantIdSchema,
	pin: z.string().trim().regex(PIN_PATTERN, "PIN must be 4 to 6 digits"),
});

export const revokeDeviceInput = z.object({
	deviceId: z.string().uuid(),
});

export const listDevicesInput = z.object({
	restaurantId: restaurantIdSchema,
});
