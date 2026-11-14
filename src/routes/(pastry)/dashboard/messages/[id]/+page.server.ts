import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getOwnShop, type ContactMessage } from '$lib/server/contact-messages';
import { EmailService } from '$lib/services/email-service';

const UUID = /^[0-9a-f-]{36}$/i;

async function getMessage(locals: App.Locals, shopId: string, id: string) {
	if (!UUID.test(id)) throw error(404, 'Message introuvable');
	const { data } = await (locals.supabaseServiceRole as any)
		.from('shop_messages')
		.select('id, name, email, phone, message, photos, read_at, replied_at, reply_text, handled_at, created_at')
		.eq('id', id)
		.eq('shop_id', shopId)
		.maybeSingle();
	if (!data) throw error(404, 'Message introuvable');
	return data as ContactMessage;
}

async function setFields(locals: App.Locals, shopId: string, id: string, fields: Record<string, unknown>) {
	return (locals.supabaseServiceRole as any).from('shop_messages').update(fields).eq('id', id).eq('shop_id', shopId);
}

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { shop } = await parent();
	const message = await getMessage(locals, shop.id, params.id);
	// Ouvrir le message le marque comme lu
	if (!message.read_at) {
		message.read_at = new Date().toISOString();
		await setFields(locals, shop.id, message.id, { read_at: message.read_at });
	}
	return { message };
};

export const actions: Actions = {
	reply: async ({ request, locals, params }) => {
		const shop = await getOwnShop(locals);
		const message = await getMessage(locals, shop.id, params.id);
		const reply = String((await request.formData()).get('reply') || '').trim().slice(0, 5000);
		if (reply.length < 2) return fail(400, { replyError: 'Écris ta réponse avant de l’envoyer.', reply });

		const result = await EmailService.sendContactReply({
			to: message.email,
			name: message.name,
			reply,
			originalMessage: message.message,
			shopName: shop.name,
			shopLogo: shop.logo_url,
		});
		if (!result.success) return fail(500, { replyError: "La réponse n'a pas pu être envoyée. Réessaie dans un instant.", reply });

		const previous = message.reply_text ? message.reply_text + '\n\n———\n\n' : '';
		await setFields(locals, shop.id, message.id, {
			replied_at: new Date().toISOString(),
			reply_text: (previous + reply).slice(0, 20000),
			handled_at: new Date().toISOString(),
		});
		return { replied: true };
	},
	markUnread: async ({ locals, params }) => {
		const shop = await getOwnShop(locals);
		await getMessage(locals, shop.id, params.id);
		await setFields(locals, shop.id, params.id, { read_at: null });
		redirect(303, '/dashboard/messages');
	},
	toggleHandled: async ({ locals, params }) => {
		const shop = await getOwnShop(locals);
		const message = await getMessage(locals, shop.id, params.id);
		await setFields(locals, shop.id, message.id, { handled_at: message.handled_at ? null : new Date().toISOString() });
		return { success: true };
	},
	delete: async ({ locals, params }) => {
		const shop = await getOwnShop(locals);
		await getMessage(locals, shop.id, params.id);
		await (locals.supabaseServiceRole as any).from('shop_messages').delete().eq('id', params.id).eq('shop_id', shop.id);
		redirect(303, '/dashboard/messages');
	},
};
