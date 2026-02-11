import { z } from 'zod';
import { loginSchema } from '$lib/validations';
import { emailSchema, otpCodeSchema } from '$lib/validations/schemas/common';

export const formSchema = loginSchema;
export type FormSchema = typeof formSchema;

/** Schéma pour l’étape 2 : vérification du code OTP à 8 chiffres */
export const loginOtpSchema = z.object({
	email: emailSchema,
	code: otpCodeSchema
});
export type LoginOtpSchema = typeof loginOtpSchema;
