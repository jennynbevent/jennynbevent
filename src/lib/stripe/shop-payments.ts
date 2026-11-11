/**
 * Paiement direct par carte (Stripe Checkout) pour la boutique Jnb Event.
 *
 * Une seule clé pour tout le site : le nom et le montant de chaque commande
 * sont envoyés à Stripe au moment du paiement (rien à créer par article).
 *
 * Variables d'environnement (Vercel) :
 *   STRIPE_SECRET_KEY      (sk_test_... puis sk_live_...)
 *   STRIPE_WEBHOOK_SECRET  (whsec_...)
 */
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SITE_URL } from '$env/static/public';
import { EmailService } from '$lib/services/email-service';
import { getShopColorFromShopId } from '$lib/emails/helpers';
import { buildOrderEmailExtras } from '$lib/emails/order-extras';
import { amountDueNow } from '$lib/utils/deposit';
import { ErrorLogger } from '$lib/services/error-logging';

let _stripe: Stripe | null = null;

export function getShopStripe(): Stripe | null {
	const key = (env.STRIPE_SECRET_KEY || '').trim();
	if (!key) return null;
	if (!_stripe) _stripe = new Stripe(key);
	return _stripe;
}

/** Les deux clés sont présentes dans Vercel */
export function isStripeConfigured(): boolean {
	return !!(env.STRIPE_SECRET_KEY || '').trim() && !!(env.STRIPE_WEBHOOK_SECRET || '').trim();
}

/** Mode test (clé sk_test_) ou réel (sk_live_) */
export function stripeMode(): 'test' | 'live' | null {
	const key = (env.STRIPE_SECRET_KEY || '').trim();
	if (!key) return null;
	return key.startsWith('sk_live_') ? 'live' : 'test';
}

const cents = (amount: number) => Math.round((Number(amount) || 0) * 100);

/* ------------------------------------------------------------------ */
/* Création de la page de paiement                                    */
/* ------------------------------------------------------------------ */

/** Commande d'un article (pending_order) */
export async function createProductCheckout(
	admin: SupabaseClient,
	orderRef: string,
	origin: string
): Promise<string> {
	const stripe = getShopStripe();
	if (!stripe) throw new Error('Stripe non configuré');

	const { data: pending } = await (admin as any)
		.from('pending_orders')
		.select('order_ref, order_data')
		.eq('order_ref', orderRef)
		.single();
	if (!pending) throw new Error('Commande introuvable');

	const orderData = pending.order_data as any;
	const { data: product } = await (admin as any)
		.from('products')
		.select('name, image_url, deposit_percentage')
		.eq('id', orderData.product_id)
		.single();

	const amount = amountDueNow(orderData.total_amount, product?.deposit_percentage);
	if (cents(amount) < 50) throw new Error('Montant trop faible pour un paiement par carte (0,50 € minimum)');

	const name = orderData.product_name || product?.name || 'Commande';
	const checkoutPath = `/product/${orderData.product_id}/checkout/${orderRef}`;

	const session = await stripe.checkout.sessions.create({
		mode: 'payment',
		customer_email: orderData.customer_email || undefined,
		client_reference_id: orderRef,
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: 'eur',
					unit_amount: cents(amount),
					product_data: {
						name,
						...(product?.image_url ? { images: [product.image_url] } : {}),
					},
				},
			},
		],
		metadata: { kind: 'product', order_ref: orderRef },
		payment_intent_data: { description: `${name} – réf. ${orderRef}`, metadata: { order_ref: orderRef } },
		success_url: `${origin}${checkoutPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}${checkoutPath}?payment=cancelled`,
		locale: 'fr',
	});
	if (!session.url) throw new Error('Session Stripe sans adresse');
	return session.url;
}

/** Devis sur mesure (commande au statut « quoted ») */
export async function createQuoteCheckout(
	admin: SupabaseClient,
	orderRef: string,
	origin: string
): Promise<string> {
	const stripe = getShopStripe();
	if (!stripe) throw new Error('Stripe non configuré');

	const { data: order } = await (admin as any)
		.from('orders')
		.select('id, order_ref, total_amount, customer_email, status')
		.eq('order_ref', orderRef)
		.eq('status', 'quoted')
		.single();
	if (!order) throw new Error('Devis introuvable');
	if (cents(order.total_amount) < 50) throw new Error('Montant trop faible pour un paiement par carte');

	const checkoutPath = `/custom/checkout/${orderRef}`;
	const session = await stripe.checkout.sessions.create({
		mode: 'payment',
		customer_email: order.customer_email || undefined,
		client_reference_id: orderRef,
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: 'eur',
					unit_amount: cents(order.total_amount),
					product_data: { name: 'Commande sur mesure' },
				},
			},
		],
		metadata: { kind: 'quote', order_ref: orderRef, order_id: order.id },
		payment_intent_data: { description: `Commande sur mesure – réf. ${orderRef}`, metadata: { order_ref: orderRef } },
		success_url: `${origin}${checkoutPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}${checkoutPath}?payment=cancelled`,
		locale: 'fr',
	});
	if (!session.url) throw new Error('Session Stripe sans adresse');
	return session.url;
}

/* ------------------------------------------------------------------ */
/* Finalisation après paiement (appelée au retour ET par le webhook)  */
/* ------------------------------------------------------------------ */

async function findOrderIdByRef(admin: SupabaseClient, orderRef: string): Promise<string | null> {
	const { data } = await (admin as any).from('orders').select('id').eq('order_ref', orderRef).maybeSingle();
	return data?.id ?? null;
}

async function waitForOrder(admin: SupabaseClient, orderRef: string): Promise<string | null> {
	for (let i = 0; i < 10; i++) {
		const id = await findOrderIdByRef(admin, orderRef);
		if (id) return id;
		await new Promise((r) => setTimeout(r, 600));
	}
	return null;
}

async function shopOwnerEmail(admin: SupabaseClient, shopId: string): Promise<string | null> {
	const { data: shop } = await (admin as any).from('shops').select('profile_id').eq('id', shopId).single();
	if (!shop?.profile_id) return null;
	const { data: profile } = await (admin as any).from('profiles').select('email').eq('id', shop.profile_id).single();
	return profile?.email || null;
}

/**
 * Vérifie une session Stripe payée et crée/confirme la commande.
 * Sans danger si appelée plusieurs fois : une seule exécution « gagne ».
 * Renvoie l'identifiant de la commande, ou null si non payée.
 */
export async function finalizeStripeSession(
	admin: SupabaseClient,
	sessionOrId: string | Stripe.Checkout.Session
): Promise<string | null> {
	const stripe = getShopStripe();
	if (!stripe) return null;

	const session =
		typeof sessionOrId === 'string' ? await stripe.checkout.sessions.retrieve(sessionOrId) : sessionOrId;
	if (session.payment_status !== 'paid') return null;

	const orderRef = session.metadata?.order_ref || session.client_reference_id || '';
	if (!orderRef) return null;
	const paidAmount = (session.amount_total ?? 0) / 100;

	if (session.metadata?.kind === 'quote') {
		return finalizeQuote(admin, orderRef, paidAmount);
	}
	return finalizeProduct(admin, orderRef, paidAmount);
}

async function finalizeProduct(admin: SupabaseClient, orderRef: string, paidAmount: number): Promise<string | null> {
	// Commande déjà créée ?
	const existing = await findOrderIdByRef(admin, orderRef);
	if (existing) return existing;

	// « Réserver » la commande en supprimant la commande en attente (une seule exécution y parvient)
	const { data: claimed } = await (admin as any)
		.from('pending_orders')
		.delete()
		.eq('order_ref', orderRef)
		.select('order_ref, order_data');

	if (!claimed || claimed.length === 0) {
		// Déjà prise en charge par l'autre appel : attendre qu'elle apparaisse
		return waitForOrder(admin, orderRef);
	}

	const orderData = claimed[0].order_data as any;
	const { data: product } = await (admin as any)
		.from('products')
		.select('base_price, image_url, shops(name, logo_url)')
		.eq('id', orderData.product_id)
		.single();

	const { data: order, error } = await (admin as any)
		.from('orders')
		.insert({
			shop_id: orderData.shop_id,
			product_id: orderData.product_id,
			customer_name: orderData.customer_name,
			customer_email: orderData.customer_email,
			customer_phone: orderData.customer_phone || null,
			customer_instagram: orderData.customer_instagram || null,
			pickup_date: orderData.pickup_date,
			pickup_time: orderData.pickup_time || null,
			pickup_date_end: orderData.pickup_date_end || null,
			additional_information: orderData.additional_information || null,
			customization_data: orderData.customization_data || null,
			inspiration_photos: orderData.inspiration_photos || [],
			status: 'confirmed',
			total_amount: orderData.total_amount,
			paid_amount: paidAmount,
			product_name: orderData.product_name,
			product_base_price: product?.base_price || 0,
			order_ref: orderRef,
			payment_provider: 'stripe',
		})
		.select()
		.single();

	if (error || !order) {
		// Remettre la commande en attente pour ne rien perdre
		await (admin as any).from('pending_orders').insert({ order_ref: orderRef, order_data: orderData });
		await ErrorLogger.logCritical(error || new Error('insert failed'), { orderRef }, { action: 'stripeFinalizeProduct', critical: true });
		throw new Error('Création de la commande impossible');
	}

	// E-mails : confirmation au client + notification à la boutique
	try {
		const shopColor = await getShopColorFromShopId(admin, orderData.shop_id);
		const extras = buildOrderEmailExtras(orderData, product?.image_url);
		await EmailService.sendOrderConfirmation({
			customerEmail: orderData.customer_email,
			customerName: orderData.customer_name,
			shopName: product?.shops?.name || 'Jnb Event',
			shopLogo: product?.shops?.logo_url || undefined,
			productName: orderData.product_name,
			pickupDate: orderData.pickup_date,
			pickupTime: orderData.pickup_time,
			pickupDateEnd: orderData.pickup_date_end ?? undefined,
			totalAmount: orderData.total_amount,
			paidAmount,
			remainingAmount: orderData.total_amount - paidAmount,
			orderId: order.id,
			orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
			date: new Date().toLocaleDateString('fr-FR'),
			shopColor,
			extras,
		});
		const ownerEmail = await shopOwnerEmail(admin, orderData.shop_id);
		if (ownerEmail) {
			await EmailService.sendOrderNotification({
				pastryEmail: ownerEmail,
				customerName: orderData.customer_name,
				customerEmail: orderData.customer_email,
				customerInstagram: orderData.customer_instagram || undefined,
				productName: orderData.product_name,
				pickupDate: orderData.pickup_date,
				pickupTime: orderData.pickup_time,
				pickupDateEnd: orderData.pickup_date_end ?? undefined,
				totalAmount: orderData.total_amount,
				paidAmount,
				remainingAmount: orderData.total_amount - paidAmount,
				orderId: order.id,
				dashboardUrl: `${PUBLIC_SITE_URL}/dashboard/orders/${order.id}`,
				date: new Date().toLocaleDateString('fr-FR'),
			});
		}
	} catch (e) {
		console.error('[Stripe] email error:', e);
	}

	return order.id;
}

async function finalizeQuote(admin: SupabaseClient, orderRef: string, paidAmount: number): Promise<string | null> {
	// Passer le devis en « confirmé » (une seule exécution y parvient grâce au filtre sur le statut)
	const { data: updated } = await (admin as any)
		.from('orders')
		.update({ status: 'confirmed', paid_amount: paidAmount, payment_provider: 'stripe' })
		.eq('order_ref', orderRef)
		.eq('status', 'quoted')
		.select('*, shops(id, name, logo_url)');

	if (!updated || updated.length === 0) {
		return findOrderIdByRef(admin, orderRef);
	}
	const order = updated[0];

	try {
		const shopColor = await getShopColorFromShopId(admin, order.shop_id);
		await EmailService.sendOrderConfirmation({
			customerEmail: order.customer_email,
			customerName: order.customer_name,
			shopName: order.shops?.name || 'Jnb Event',
			shopLogo: order.shops?.logo_url || undefined,
			productName: 'Commande sur mesure',
			pickupDate: order.chef_pickup_date || order.pickup_date,
			pickupTime: order.chef_pickup_time || order.pickup_time,
			totalAmount: order.total_amount,
			paidAmount,
			remainingAmount: order.total_amount - paidAmount,
			orderId: order.id,
			orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
			date: new Date().toLocaleDateString('fr-FR'),
			shopColor,
		});
		const ownerEmail = await shopOwnerEmail(admin, order.shop_id);
		if (ownerEmail) {
			await EmailService.sendOrderNotification({
				pastryEmail: ownerEmail,
				customerName: order.customer_name,
				customerEmail: order.customer_email,
				customerInstagram: order.customer_instagram || undefined,
				productName: 'Commande sur mesure (devis payé)',
				pickupDate: order.chef_pickup_date || order.pickup_date,
				pickupTime: order.chef_pickup_time || order.pickup_time,
				totalAmount: order.total_amount,
				paidAmount,
				remainingAmount: order.total_amount - paidAmount,
				orderId: order.id,
				dashboardUrl: `${PUBLIC_SITE_URL}/dashboard/orders/${order.id}`,
				date: new Date().toLocaleDateString('fr-FR'),
			});
		}
	} catch (e) {
		console.error('[Stripe] email error:', e);
	}
	return order.id;
}
