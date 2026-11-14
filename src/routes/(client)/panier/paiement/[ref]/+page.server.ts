import { error, redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { isStripeConfigured, createCartCheckout, finalizeStripeSession } from '$lib/stripe/shop-payments';
import { loadPendingCart, finalizeCart, emailLines } from '$lib/cart/server';

const REF_RE = /^[0-9A-Za-z]{6,12}$/;

async function firstOrderOfCart(locals: App.Locals, ref: string) {
	const { data } = await (locals.supabaseServiceRole as any)
		.from('orders')
		.select('id')
		.eq('cart_ref', ref)
		.order('created_at', { ascending: true })
		.limit(1);
	return data?.[0]?.id as string | undefined;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const ref = params.ref;
	if (!REF_RE.test(ref)) throw error(404, 'Commande non trouvée');

	// Retour après un paiement par carte
	const sessionId = url.searchParams.get('session_id');
	if (url.searchParams.get('payment') === 'success' && sessionId && isStripeConfigured()) {
		let orderId: string | null = null;
		try {
			orderId = await finalizeStripeSession(locals.supabaseServiceRole as any, sessionId);
		} catch (e) {
			console.error('[panier] finalisation au retour impossible:', e);
		}
		if (orderId) throw redirect(303, `/panier/merci/${orderId}`);
	}

	const cart = await loadPendingCart(locals.supabaseServiceRole as any, ref);
	if (!cart) {
		const id = await firstOrderOfCart(locals, ref);
		if (id) throw redirect(303, `/panier/merci/${id}`);
		throw error(404, 'Commande non trouvée');
	}

	const { data: shop } = await (locals.supabaseServiceRole as any)
		.from('shops')
		.select('id, name, logo_url, profile_id')
		.eq('id', cart.shop_id)
		.single();
	if (!shop) throw error(404, 'Boutique non trouvée');

	const { data: links } = await (locals.supabaseServiceRole as any)
		.from('payment_links')
		.select('provider_type, payment_identifier')
		.eq('profile_id', shop.profile_id)
		.eq('is_active', true);
	const order: Record<string, number> = { stripe: 0, wero: 1, paypal: 2, revolut: 3 };
	const paymentLinks = (links || [])
		.filter((pl: any) => pl.provider_type !== 'stripe' || isStripeConfigured())
		.sort((a: any, b: any) => (order[a.provider_type] ?? 99) - (order[b.provider_type] ?? 99));
	if (!paymentLinks.length) throw error(500, 'Aucun moyen de paiement disponible');

	return {
		ref,
		shop: { id: shop.id, name: shop.name, logo_url: shop.logo_url },
		total: cart.total_amount,
		items: emailLines(cart.lines),
		customerName: cart.customer_name,
		pickupDate: cart.pickup_date,
		pickupTime: cart.pickup_time,
		paymentLinks,
		cancelled: url.searchParams.get('payment') === 'cancelled',
	};
};

export const actions: Actions = {
	card: async ({ params, locals, url }) => {
		if (!isStripeConfigured()) return fail(400, { error: 'Paiement par carte indisponible' });
		try {
			const checkoutUrl = await createCartCheckout(locals.supabaseServiceRole as any, params.ref, url.origin);
			return { checkoutUrl };
		} catch (e) {
			console.error('[panier] Stripe:', e);
			return fail(400, { error: e instanceof Error ? e.message : 'Erreur' });
		}
	},
	manual: async ({ params, locals, request }) => {
		const provider = String((await request.formData()).get('provider') || '');
		if (!['paypal', 'wero', 'revolut'].includes(provider)) return fail(400, { error: 'Moyen de paiement invalide' });
		const cart = await loadPendingCart(locals.supabaseServiceRole as any, params.ref);
		if (!cart) {
			const id = await firstOrderOfCart(locals, params.ref);
			if (id) throw redirect(303, `/panier/merci/${id}`);
			return fail(404, { error: 'Commande non trouvée' });
		}
		// Le moyen de paiement doit être activé par la boutique
		const { data: shop } = await (locals.supabaseServiceRole as any).from('shops').select('profile_id').eq('id', cart.shop_id).single();
		const { data: link } = await (locals.supabaseServiceRole as any)
			.from('payment_links')
			.select('provider_type')
			.eq('profile_id', shop?.profile_id)
			.eq('provider_type', provider)
			.eq('is_active', true)
			.maybeSingle();
		if (!link) return fail(400, { error: 'Moyen de paiement indisponible' });

		let id: string | null = null;
		try {
			id = await finalizeCart(locals.supabaseServiceRole as any, params.ref, { provider, byCard: false });
		} catch {
			return fail(500, { error: 'Une erreur est survenue, merci de réessayer.' });
		}
		if (!id) return fail(500, { error: 'Une erreur est survenue, merci de réessayer.' });
		throw redirect(303, `/panier/merci/${id}`);
	},
};
