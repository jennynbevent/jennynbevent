export const ssr = false;

import { fail, redirect, type Actions } from '@sveltejs/kit';
import type { Provider } from '@supabase/supabase-js';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad } from './$types.js';
import { formSchema, loginOtpSchema } from './schema';

export const load: PageServerLoad = async ({ url }) => {
	const step = url.searchParams.get('step');
	const emailParam = url.searchParams.get('email') ?? '';
	const next = url.searchParams.get('next') || '/dashboard';

	return {
		form: await superValidate(zod(formSchema)),
		otpForm: await superValidate(zod(loginOtpSchema), {
			defaults: { email: emailParam, code: '' }
		}),
		step: step === 'code' ? 'code' : null,
		email: step === 'code' ? emailParam : null,
		next
	};
};

export const actions: Actions = {
	oauth: async (event) => {
		const provider = event.url.searchParams.get('provider') as Provider;
		const redirectTo = event.url.searchParams.get('redirectTo');
		if (!provider || !redirectTo) return fail(400, {});

		const { data, error } = await event.locals.supabase.auth.signInWithOAuth({
			provider,
			options: {
				redirectTo,
				queryParams: {
					access_type: 'offline',
					prompt: 'consent',
				},
			},
		});

		if (error) return fail(400, {});
		redirect(303, data.url);
	},

	sendOtp: async (event) => {
		const rateLimitExceeded = event.request.headers.get('x-rate-limit-exceeded');
		if (rateLimitExceeded === 'true') {
			const rateLimitMessage =
				event.request.headers.get('x-rate-limit-message') || 'Trop de tentatives. Veuillez patienter.';
			const form = await superValidate(zod(formSchema));
			setError(form, '', rateLimitMessage);
			return { form };
		}

		const supabase = event.locals.supabase;
		const form = await superValidate(event, zod(formSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		const { email } = form.data;
		const next = event.url.searchParams.get('next') || '/dashboard';

		// Envoie un email avec un code OTP 6 chiffres. Dans Supabase Dashboard > Auth > Email Templates,
		// personnaliser le template "Magic Link" pour afficher le code : {{ .Token }}
		const { error } = await supabase.auth.signInWithOtp({
			email,
			options: {
				shouldCreateUser: true,
			},
		});

		if (error) {
			if (error.message?.includes('Too many requests')) {
				return setError(form, '', 'Trop de tentatives. Attendez avant de réessayer.');
			}
			return setError(form, '', error.message || 'Erreur lors de l\'envoi du code. Veuillez réessayer.');
		}

		// Rediriger vers l’étape saisie du code OTP (6 chiffres envoyés par email)
		throw redirect(303, `/login?email=${encodeURIComponent(email)}&step=code&next=${encodeURIComponent(next)}`);
	},

	verifyOtp: async (event) => {
		const loginOtpForm = await superValidate(event.request, zod(loginOtpSchema));
		const next = event.url.searchParams.get('next') || '/dashboard';
		const email = loginOtpForm.data.email ?? '';

		if (!loginOtpForm.valid) {
			const emptyForm = await superValidate(zod(formSchema));
			return fail(400, { form: emptyForm, otpForm: loginOtpForm, step: 'code' as const, email, next });
		}

		const { code } = loginOtpForm.data;

		const { data, error } = await event.locals.supabase.auth.verifyOtp({
			email,
			token: code,
			type: 'email',
		});

		if (error) {
			let msg = 'Code invalide ou expiré. Vérifiez le code ou renvoyez-en un nouveau.';
			if (error.message?.includes('expired')) msg = 'Le code a expiré. Demandez un nouveau code.';
			if (error.message?.includes('Too many')) msg = 'Trop de tentatives. Réessayez plus tard.';
			setError(loginOtpForm, 'code', msg);
			const emptyForm = await superValidate(zod(formSchema));
			return fail(400, { form: emptyForm, otpForm: loginOtpForm, step: 'code' as const, email, next });
		}

		if (data.session) {
			throw redirect(303, next);
		}

		setError(loginOtpForm, '', 'Une erreur est survenue.');
		const emptyForm = await superValidate(zod(formSchema));
		return fail(500, { form: emptyForm, otpForm: loginOtpForm, step: 'code' as const, email, next });
	},
};
