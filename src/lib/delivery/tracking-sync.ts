import { trackParcel, isTrackingConfigured, type TrackingState } from './laposte-suivi';
import { trackingUrl } from './settings';
import { EmailService } from '$lib/services/email-service';
import { sendPushToAll } from '$lib/push';
import { getShopColorFromShopId } from '$lib/emails/helpers';

export type SyncResult = { checked: boolean; state?: TrackingState; label?: string; error?: string; changed?: boolean };

const RANK: Record<string, number> = { unknown: 0, in_transit: 1, anomaly: 1, out_for_delivery: 2, available: 3, delivered: 4 };

/**
 * Interroge La Poste pour le colis d'une commande « Expédiée »
 * et met à jour toutes les commandes du même colis :
 *  - disponible au point retrait / bureau de poste → e-mail au client + notification pour toi
 *  - livré (ou retiré) → « Terminée » + notification pour toi
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncParcel(admin: any, orderId: string, opts: { minMinutes?: number } = {}): Promise<SyncResult> {
	if (!isTrackingConfigured()) return { checked: false, error: 'not_configured' };

	const { data: order } = await admin
		.from('orders')
		.select('id, shop_id, status, cart_ref, order_ref, customer_name, customer_email, tracking_number, tracking_status, tracking_checked_at, shipping_relay')
		.eq('id', orderId)
		.maybeSingle();
	if (!order?.tracking_number || !order.shipping_relay || order.status !== 'ready') return { checked: false };

	const minMinutes = opts.minMinutes ?? 0;
	if (minMinutes > 0 && order.tracking_checked_at) {
		const age = (Date.now() - new Date(order.tracking_checked_at).getTime()) / 60000;
		if (age < minMinutes) return { checked: false, state: order.tracking_status || undefined };
	}

	// Toutes les commandes du même colis
	let ids: string[] = [order.id];
	if (order.cart_ref) {
		const { data: rows } = await admin
			.from('orders')
			.select('id')
			.eq('cart_ref', order.cart_ref)
			.eq('shop_id', order.shop_id)
			.eq('tracking_number', order.tracking_number);
		if (rows?.length) ids = rows.map((r: { id: string }) => r.id);
	}

	const now = new Date().toISOString();
	const res = await trackParcel(order.tracking_number);
	if (!res.ok) {
		await admin.from('orders').update({ tracking_checked_at: now }).in('id', ids);
		return { checked: true, error: res.error };
	}

	const prev = String(order.tracking_status || 'unknown');
	// On n'avance jamais « en arrière » (un vieil événement ne doit pas annuler une étape)
	const state: TrackingState = (RANK[res.state] ?? 0) >= (RANK[prev] ?? 0) ? res.state : (prev as TrackingState);
	const update: Record<string, unknown> = { tracking_status: state, tracking_label: res.label || null, tracking_checked_at: now };

	const relay = order.shipping_relay;
	const ref = order.cart_ref || order.order_ref;
	let changed = false;

	if ((state === 'available' || state === 'delivered') && (RANK[prev] ?? 0) < RANK.available) {
		update.relay_arrived_at = now;
		changed = true;
		if (state === 'available' && relay?.kind === 'point') {
			try {
				const { data: shop } = await admin.from('shops').select('name, logo_url').eq('id', order.shop_id).single();
				const shopColor = await getShopColorFromShopId(admin, order.shop_id);
				await EmailService.sendParcelArrived(order.customer_email, {
					customerName: order.customer_name,
					shopName: shop?.name || 'Jnb Event',
					shopLogo: shop?.logo_url || null,
					shopColor,
					relay,
					tracking: order.tracking_number,
					trackingUrl: trackingUrl(order.tracking_number),
					orderRef: ref,
				});
			} catch (e) {
				console.error('[suivi] e-mail colis disponible:', e);
			}
		}
		if (state === 'available') {
			await sendPushToAll({
				title: relay?.kind === 'point' ? '📦 Colis arrivé au point retrait' : '📦 Colis en attente au bureau de poste',
				body: `${order.customer_name} · ${relay?.kind === 'point' ? relay?.name || '' : 'client absent, avis de passage'}`,
				url: `/dashboard/orders/${order.id}`,
				tag: `dispo-${order.tracking_number}`,
			});
		}
	}

	if (state === 'delivered' && prev !== 'delivered') {
		update.status = 'completed';
		changed = true;
		await sendPushToAll({
			title: relay?.kind === 'point' ? '✅ Colis retiré !' : '✅ Colis livré !',
			body: `${order.customer_name} a reçu son colis · commande terminée`,
			url: `/dashboard/orders/${order.id}`,
			tag: `livre-${order.tracking_number}`,
		});
	}

	if (state === 'anomaly' && prev !== 'anomaly') {
		await sendPushToAll({
			title: '⚠️ Problème de livraison',
			body: `${order.customer_name} · ${res.label || 'voir le suivi La Poste'}`,
			url: `/dashboard/orders/${order.id}`,
			tag: `pb-${order.tracking_number}`,
		});
	}

	await admin.from('orders').update(update).in('id', ids).eq('status', 'ready');
	if (update.status !== 'completed') {
		// déjà terminées à la main : on met juste le suivi à jour
		await admin.from('orders').update({ tracking_status: state, tracking_label: res.label || null, tracking_checked_at: now }).in('id', ids).neq('status', 'ready');
	}
	return { checked: true, state, label: res.label, changed };
}
