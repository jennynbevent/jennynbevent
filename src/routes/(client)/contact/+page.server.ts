import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { EmailService } from '$lib/services/email-service';
import { PUBLIC_SITE_URL } from '$env/static/public';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

async function loadShop(locals: App.Locals, shopId: string | null) {
	if (!shopId) return null;
	const { data } = await (locals.supabaseServiceRole as any)
		.from('shops')
		.select('id, name, logo_url, is_custom_accepted, is_visible, instagram, tiktok, website')
		.eq('id', shopId)
		.maybeSingle();
	return data;
}

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { shopId } = await parent();
	const shop = await loadShop(locals, shopId);
	if (!shop || shop.is_visible === false) throw error(404, 'Boutique non trouvée');
	if (!shop.is_custom_accepted) throw error(404, 'La page Contact est désactivée pour le moment');
	return { shop };
};

export const actions: Actions = {
	send: async ({ request, locals }) => {
		const fd = await request.formData();
		// Champ piège invisible : rempli uniquement par les robots
		if (String(fd.get('website') || '').trim()) return { success: true };

		const name = String(fd.get('name') || '').trim().slice(0, 120);
		const email = String(fd.get('email') || '').trim().toLowerCase().slice(0, 200);
		const phone = String(fd.get('phone') || '').trim().slice(0, 40);
		const message = String(fd.get('message') || '').trim().slice(0, 3000);
		const values = { name, email, phone, message };

		if (!name) return fail(400, { values, error: 'Merci d’indiquer votre nom.' });
		if (!EMAIL_RE.test(email)) return fail(400, { values, error: 'Merci d’indiquer une adresse e-mail valide.' });
		if (message.length < 5) return fail(400, { values, error: 'Merci d’écrire votre message.' });

		const { data: shopRow } = await (locals.supabaseServiceRole as any)
			.from('shops')
			.select('id, name, logo_url, is_custom_accepted')
			.limit(1)
			.eq('id', String(fd.get('shopId') || ''))
			.maybeSingle();
		if (!shopRow || !shopRow.is_custom_accepted) return fail(400, { values, error: 'La page Contact est désactivée.' });

		// Anti-abus : 5 messages maximum par heure pour une même adresse
		const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const { count } = await (locals.supabaseServiceRole as any)
			.from('shop_messages')
			.select('id', { count: 'exact', head: true })
			.eq('email', email)
			.gte('created_at', since);
		if ((count ?? 0) >= 5) return fail(429, { values, error: 'Vous avez déjà envoyé plusieurs messages. Merci de patienter un peu.' });

		// Photos d'inspiration (facultatives)
		const files = (fd.getAll('photos') as File[])
			.filter((f) => f && typeof f === 'object' && f.size > 0)
			.slice(0, MAX_PHOTOS);
		for (const f of files) {
			if (!f.type.startsWith('image/')) return fail(400, { values, error: 'Seules les photos sont acceptées.' });
			if (f.size > MAX_PHOTO_SIZE) return fail(400, { values, error: 'Chaque photo doit faire moins de 10 Mo.' });
		}
		const photos: string[] = [];
		if (files.length) {
			const { uploadInspirationPhoto } = await import('$lib/cloudinary');
			const folderId = `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			for (let i = 0; i < files.length; i++) {
				try {
					const { secure_url } = await uploadInspirationPhoto(files[i], shopRow.id, folderId, i + 1);
					if (secure_url) photos.push(secure_url);
				} catch (e) {
					console.error('[contact] photo:', e);
				}
			}
		}

		const { data: saved, error: insertError } = await (locals.supabaseServiceRole as any)
			.from('shop_messages')
			.insert({ shop_id: shopRow.id, name, email, phone: phone || null, message, photos })
			.select('id')
			.single();
		if (insertError || !saved) {
			console.error('[contact] enregistrement:', insertError);
			const missing = /shop_messages/.test(insertError?.message || '');
			return fail(500, {
				values,
				error: missing ? 'La messagerie n’est pas encore prête. Merci de réessayer plus tard.' : 'Une erreur est survenue, merci de réessayer.',
			});
		}

		// E-mails + notification (un échec d'envoi n'empêche pas l'enregistrement)
		try {
			const { data: ownerEmail } = await (locals.supabaseServiceRole as any).rpc('get_shop_owner_email', { shop_uuid: shopRow.id });
			await Promise.all([
				EmailService.sendContactMessageNotification({
					to: ownerEmail || 'contact@jennynbevent.com',
					name,
					email,
					phone: phone || null,
					message,
					photos,
					dashboardUrl: `${PUBLIC_SITE_URL}/dashboard/messages/${saved.id}`,
				}),
				EmailService.sendContactMessageCopy({ to: email, name, message, shopName: shopRow.name, shopLogo: shopRow.logo_url }),
			]);
		} catch (e) {
			console.error('[contact] e-mails:', e);
		}

		return { success: true };
	},
};
