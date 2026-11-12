import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAllowedAdminEmail } from '$lib/auth/admin-access';
import { sendPushToAll } from '$lib/push';

// Envoie une notification d'essai à tous les appareils
export const POST: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user || !isAllowedAdminEmail(user.email)) return json({ error: 'Non autorisé' }, { status: 401 });
	const sent = await sendPushToAll({
		title: '🔔 Notifications activées',
		body: 'Vous serez prévenue ici à chaque nouvelle commande.',
		url: '/dashboard/orders',
		tag: 'test',
	});
	return json({ sent });
};
