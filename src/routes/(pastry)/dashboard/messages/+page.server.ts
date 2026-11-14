import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getOwnShop, type ContactMessage } from '$lib/server/contact-messages';

export const load: PageServerLoad = async ({ locals, parent, depends }) => {
	depends('app:messages');
	const { shop } = await parent();
	const { data, error } = await (locals.supabaseServiceRole as any)
		.from('shop_messages')
		.select('id, name, email, phone, message, photos, read_at, replied_at, reply_text, handled_at, created_at')
		.eq('shop_id', shop.id)
		.order('created_at', { ascending: false })
		.limit(300);
	return {
		messages: (data ?? []) as ContactMessage[],
		ready: !error,
		contactEnabled: !!shop.is_custom_accepted,
	};
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		const shop = await getOwnShop(locals);
		const fd = await request.formData();
		const enabled = fd.get('enabled') === 'true';
		const { data: rows, error } = await (locals.supabaseServiceRole as any)
			.from('shops')
			.update({ is_custom_accepted: enabled })
			.eq('id', shop.id)
			.select('is_custom_accepted');
		if (error || !rows?.length) {
			console.error('[messages] activation:', error);
			return fail(500, { error: "Impossible d'enregistrer le réglage." });
		}
		return { success: true, enabled };
	},
};
