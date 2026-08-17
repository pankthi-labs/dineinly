import { z } from "zod";

export const resolveSignInInput = z.object({
	email: z.string().trim().toLowerCase().email(),
});

export const updateDisplayNameInput = z.object({
	name: z.string().trim().min(2).max(80),
});
