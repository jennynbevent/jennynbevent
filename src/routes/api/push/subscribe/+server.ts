import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAllowedAdminEmail } from '$lib/auth/admin-access';
import { saveSubscription, deleteSubscription } from '$lib/push';

async function guard(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	return !!user && isAllowedAdminEmail(user.email);
}

// Enregistre cet appareil pour recevoir les notifications
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!(await guard(locals))) return json({ error: 'Non autorisé' }, { status: 401 });
	const body = await request.json().catch(() => null);
	const ok =
		body &&
		typeof body.endpoint === 'string' &&
		body.endpoint.startsWith('https://') &&
		typeof body.keys?.p256dh === 'string' &&
		typeof body.keys?.auth === 'string';
	if (!ok) return json({ error: 'Abonnement invalide' }, { status: 400 });
	const { error } = await saveSubscription(body, request.headers.get('user-agent') || '');
	if (error) {
		console.error('[push] enregistrement:', error);
		const missing = /push_subscriptions/.test(error.message || '');
		return json(
			{ error: missing ? 'Il manque la table « push_subscriptions » dans Supabase (commande SQL à exécuter).' : "Impossible d'enregistrer cet appareil." },
			{ status: 500 }
		);
	}
	return json({ ok: true });
};

// Désactive les notifications sur cet appareil
export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!(await guard(locals))) return json({ error: 'Non autorisé' }, { status: 401 });
	const body = await request.json().catch(() => null);
	if (body?.endpoint) await deleteSubscription(String(body.endpoint));
	return json({ ok: true });
};
