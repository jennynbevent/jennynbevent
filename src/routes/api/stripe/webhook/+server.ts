import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { getShopStripe, finalizeStripeSession } from '$lib/stripe/shop-payments';

/**
 * Stripe prévient ici qu'un paiement a réussi : la commande est confirmée
 * automatiquement, même si le client ferme la page avant de revenir sur le site.
 * Adresse à déclarer dans Stripe : https://www.jennynbevent.com/api/stripe/webhook
 * Événement : checkout.session.completed
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const stripe = getShopStripe();
	const secret = (env.STRIPE_WEBHOOK_SECRET || '').trim();
	if (!stripe || !secret) return json({ error: 'Stripe non configuré' }, { status: 503 });

	const signature = request.headers.get('stripe-signature') || '';
	const body = await request.text();

	let event;
	try {
		event = stripe.webhooks.constructEvent(body, signature, secret);
	} catch (e) {
		console.error('[Stripe webhook] signature invalide:', e);
		return json({ error: 'Signature invalide' }, { status: 400 });
	}

	if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
		try {
			await finalizeStripeSession(locals.supabaseServiceRole as any, event.data.object as any);
		} catch (e) {
			console.error('[Stripe webhook] finalisation impossible:', e);
			// Stripe réessaiera automatiquement
			return json({ error: 'Erreur de traitement' }, { status: 500 });
		}
	}

	return json({ received: true });
};
