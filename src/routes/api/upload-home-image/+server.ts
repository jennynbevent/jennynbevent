import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserPermissions } from '$lib/auth';
import { isAllowedAdminEmail } from '$lib/auth/admin-access';
import { uploadHomeImage } from '$lib/cloudinary';

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Envoi d'une photo depuis l'ordinateur pour « Nos univers » (réservé à l'administratrice) */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user || !isAllowedAdminEmail(user.email)) return json({ error: 'Non autorisé' }, { status: 401 });
	const permissions = await getUserPermissions(user.id, locals.supabase);
	if (!permissions.shopId) return json({ error: 'Boutique introuvable' }, { status: 403 });

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) return json({ error: 'Aucune image reçue' }, { status: 400 });
	if (file.size > MAX_BYTES) return json({ error: 'Image trop lourde (10 Mo maximum)' }, { status: 400 });
	if (file.type && !TYPES.includes(file.type)) return json({ error: 'Format non accepté (JPG, PNG, WEBP ou HEIC)' }, { status: 400 });

	try {
		const { secure_url } = await uploadHomeImage(file, permissions.shopId);
		return json({ url: secure_url });
	} catch (e) {
		console.error('[upload-home-image]', e);
		return json({ error: "L'envoi de l'image a échoué" }, { status: 500 });
	}
};
