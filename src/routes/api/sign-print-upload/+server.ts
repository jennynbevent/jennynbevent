import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserPermissions } from '$lib/auth';
import { isAllowedAdminEmail } from '$lib/auth/admin-access';
import { signPrintFileUpload } from '$lib/cloudinary';

/** Autorise l'envoi d'un PDF à imprimer (réservé à l'administratrice) */
export const POST: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user || !isAllowedAdminEmail(user.email)) {
		return json({ error: 'Non autorisé' }, { status: 401 });
	}
	const permissions = await getUserPermissions(user.id, locals.supabase);
	if (!permissions.shopId) return json({ error: 'Boutique introuvable' }, { status: 403 });
	return json(signPrintFileUpload(permissions.shopId));
};
