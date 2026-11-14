/**
 * Panier côté serveur : création du panier à partir des articles, puis création
 * des commandes (une par article, toutes avec la même référence de panier).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SITE_URL } from '$env/static/public';
import { EmailService } from '$lib/services/email-service';
import { ErrorLogger } from '$lib/services/error-logging';
import { getShopColorFromShopId } from '$lib/emails/helpers';
import { optionLines, REMISE_EMAIL, REMISE_RETRAIT } from './options';
import type { CartEmailLine } from '$lib/emails/cart';
import { REMISE_DOMICILE, REMISE_POINT, type ShipAddress as RelayPoint } from '$lib/delivery/settings';

export type CartLine = {
	ref: string;
	product_id: string;
	product_name: string;
	product_base_price: number;
	image_url: string | null;
	customization_data: Record<string, any>;
	total_amount: number;
	delivery_mode: 'print' | 'email';
	inspiration_photos: string[];
	min_days_notice?: number;
};

export type CartData = {
	kind: 'cart';
	shop_id: string;
	customer_name: string;
	customer_email: string;
	customer_phone: string | null;
	additional_information: string | null;
	pickup_date: string | null;
	pickup_time: string | null;
	total_amount: number; // articles + livraison
	lines: CartLine[];
	// Envoi Colissimo (articles imprimés) : domicile ou point retrait La Poste
	delivery?: 'retrait' | 'relais';
	relay?: RelayPoint | null;
	shipping_fee?: number;
	parcel_size?: string | null;
	ship_date?: string | null; // date d'envoi prévue
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isoInDays(days: number) {
	const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
	return d.toISOString().slice(0, 10);
}

/** Lignes du panier pour les e-mails et l'affichage */
export function emailLines(lines: CartLine[]): CartEmailLine[] {
	return lines.map((l) => ({
		name: l.product_name,
		image: l.image_url,
		price: l.total_amount,
		mode: l.delivery_mode,
		lines: optionLines(l.customization_data) .concat(l.inspiration_photos?.length ? ['QR code ajouté ✓'] : []),
	}));
}

/** Panier en attente de paiement */
export async function loadPendingCart(admin: SupabaseClient, cartRef: string): Promise<CartData | null> {
	const { data } = await (admin as any).from('pending_orders').select('order_data').eq('order_ref', cartRef).maybeSingle();
	const d = data?.order_data as CartData | undefined;
	return d && d.kind === 'cart' ? d : null;
}

async function findFirstOrderId(admin: SupabaseClient, cartRef: string): Promise<string | null> {
	const { data } = await (admin as any)
		.from('orders')
		.select('id')
		.eq('cart_ref', cartRef)
		.order('created_at', { ascending: true })
		.limit(1);
	return data?.[0]?.id ?? null;
}

async function waitForOrders(admin: SupabaseClient, cartRef: string): Promise<string | null> {
	for (let i = 0; i < 10; i++) {
		const id = await findFirstOrderId(admin, cartRef);
		if (id) return id;
		await new Promise((r) => setTimeout(r, 600));
	}
	return null;
}

/**
 * Crée les commandes d'un panier payé (ou à vérifier).
 * Sans danger si appelée deux fois : une seule exécution « gagne ».
 * Renvoie l'identifiant de la première commande.
 */
export async function finalizeCart(
	admin: SupabaseClient,
	cartRef: string,
	opts: { provider: string; byCard: boolean; paidTotal?: number }
): Promise<string | null> {
	const existing = await findFirstOrderId(admin, cartRef);
	if (existing) return existing;

	const { data: claimed } = await (admin as any)
		.from('pending_orders')
		.delete()
		.eq('order_ref', cartRef)
		.select('order_data');
	if (!claimed || claimed.length === 0) return waitForOrders(admin, cartRef);

	const cart = claimed[0].order_data as CartData;
	const emailDate = isoInDays(2);
	const isRelais = cart.delivery === 'relais' && !!cart.relay;
	const fee = isRelais ? Number(cart.shipping_fee) || 0 : 0;
	const firstPrintRef = cart.lines.find((l) => l.delivery_mode !== 'email')?.ref;

	const rows = cart.lines.map((l) => {
		const isEmail = l.delivery_mode === 'email';
		const relayLine = isRelais && !isEmail;
		const lineFee = relayLine && l.ref === firstPrintRef ? fee : 0;
		const customization = { ...(l.customization_data || {}) };
		customization['Mode de remise'] = {
			value: isEmail ? REMISE_EMAIL : relayLine ? (cart.relay?.kind === 'point' ? REMISE_POINT : REMISE_DOMICILE) : REMISE_RETRAIT,
			type: 'short-text',
			price: 0,
			fieldId: 'delivery_mode',
			fieldType: 'short-text',
		};
		return {
			shop_id: cart.shop_id,
			product_id: l.product_id,
			customer_name: cart.customer_name,
			customer_email: cart.customer_email,
			customer_phone: cart.customer_phone || null,
			pickup_date: isEmail ? emailDate : relayLine ? cart.ship_date || isoInDays(3) : cart.pickup_date,
			pickup_time: isEmail || relayLine ? null : cart.pickup_time,
			additional_information: cart.additional_information || null,
			customization_data: customization,
			inspiration_photos: l.inspiration_photos || [],
			status: 'to_verify',
			total_amount: l.total_amount,
			paid_amount: Math.round((l.total_amount + lineFee) * 100) / 100,
			product_name: l.product_name,
			product_base_price: l.product_base_price || 0,
			order_ref: l.ref,
			payment_provider: opts.provider || null,
			cart_ref: cartRef,
			...(relayLine
				? { shipping_relay: cart.relay, shipping_fee: lineFee, parcel_size: cart.parcel_size || null }
				: {}),
		};
	});

	const { data: inserted, error } = await (admin as any).from('orders').insert(rows).select('id, order_ref');
	if (error || !inserted?.length) {
		await (admin as any).from('pending_orders').insert({ order_ref: cartRef, order_data: cart });
		await ErrorLogger.logCritical(error || new Error('insert failed'), { cartRef }, { action: 'finalizeCart', critical: true });
		throw new Error('Création de la commande impossible');
	}

	// Les articles du panier ne sont plus « en attente »
	await (admin as any)
		.from('pending_orders')
		.delete()
		.in('order_ref', cart.lines.map((l) => l.ref));

	const byRef = new Map(inserted.map((o: any) => [o.order_ref, o.id]));
	const firstId = byRef.get(cart.lines[0].ref) || inserted[0].id;

	try {
		const { data: shop } = await (admin as any).from('shops').select('name, logo_url, profile_id').eq('id', cart.shop_id).single();
		let ownerEmail: string | null = null;
		if (shop?.profile_id) {
			const { data: profile } = await (admin as any).from('profiles').select('email').eq('id', shop.profile_id).single();
			ownerEmail = profile?.email || null;
		}
		const shopColor = await getShopColorFromShopId(admin, cart.shop_id);
		const base = {
			customerName: cart.customer_name,
			shopName: shop?.name || 'Jnb Event',
			shopLogo: shop?.logo_url || null,
			shopColor,
			items: emailLines(cart.lines),
			total: round2(cart.total_amount),
			cartRef,
			pickupDate: cart.pickup_date,
			pickupTime: cart.pickup_time,
			relay: isRelais ? cart.relay : null,
			shippingFee: fee,
		};
		await Promise.all([
			EmailService.sendCartCustomer(cart.customer_email, {
				...base,
				stage: opts.byCard ? 'confirmed' : 'pending',
				url: `${PUBLIC_SITE_URL}/panier/merci/${firstId}`,
			}),
			EmailService.sendCartOwner(ownerEmail, {
				...base,
				url: `${PUBLIC_SITE_URL}/dashboard/orders/${firstId}`,
				customerEmail: cart.customer_email,
				customerPhone: cart.customer_phone,
				paidByCard: opts.byCard,
				info: cart.additional_information,
			}),
		]);
	} catch (e) {
		console.error('[panier] e-mails:', e);
	}

	return firstId;
}
