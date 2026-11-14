import { error } from '@sveltejs/kit';
import { isAllowedAdminEmail } from '$lib/auth/admin-access';

/** Boutique de l'administratrice connectée (sinon 401/403) */
export async function getOwnShop(locals: App.Locals) {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Non autorisé');
	if (!isAllowedAdminEmail(user.email)) throw error(403, 'Accès refusé');
	const { data: shop } = await (locals.supabase as any)
		.from('shops')
		.select('id, name, logo_url, is_custom_accepted')
		.eq('profile_id', user.id)
		.maybeSingle();
	if (!shop) throw error(404, 'Boutique non trouvée');
	return shop as { id: string; name: string; logo_url: string | null; is_custom_accepted: boolean };
}

export type ContactMessage = {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	message: string;
	photos: string[];
	read_at: string | null;
	replied_at: string | null;
	reply_text: string | null;
	handled_at: string | null;
	created_at: string;
};
