import { trackParcel, isTrackingConfigured, type TrackingState } from './mondial-relay';
import { trackingUrl } from './settings';
import { EmailService } from '$lib/services/email-service';
import { sendPushToAll } from '$lib/push';
import { getShopColorFromShopId } from '$lib/emails/helpers';

export type SyncResult = { checked: boolean; state?: TrackingState; label?: string; error?: string; changed?: boolean };

const RANK: Record<string, number> = { unknown: 0, in_transit: 1, anomaly: 1, available: 2, delivered: 3 };

/**
 * Interroge Mondial Relay pour le colis d'une commande « Expédiée »
 * et met à jour toutes les commandes du même colis :
 *  - arrivé au Point Relais → e-mail au client + notification pour toi
 *  - retiré par le client → « Terminée » + notification pour toi
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

	if ((state === 'available' || state === 'delivered') && RANK[prev] < RANK.available) {
		update.relay_arrived_at = now;
		changed = true;
		if (state === 'available') {
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
					trackingUrl: trackingUrl(order.tracking_number, relay?.zip),
					orderRef: ref,
				});
			} catch (e) {
				console.error('[suivi] e-mail colis arrivé:', e);
			}
			await sendPushToAll({
				title: '📦 Colis arrivé au Point Relais',
				body: `${order.customer_name} · ${relay?.name || ''} (${relay?.city || ''})`,
				url: `/dashboard/orders/${order.id}`,
				tag: `relais-${order.tracking_number}`,
			});
		}
	}

	if (state === 'delivered' && prev !== 'delivered') {
		update.status = 'completed';
		changed = true;
		await sendPushToAll({
			title: '✅ Colis retiré !',
			body: `${order.customer_name} a retiré son colis · commande terminée`,
			url: `/dashboard/orders/${order.id}`,
			tag: `retire-${order.tracking_number}`,
		});
	}

	await admin.from('orders').update(update).in('id', ids).eq('status', 'ready');
	if (update.status !== 'completed') {
		// déjà terminées à la main : on met juste le suivi à jour
		await admin.from('orders').update({ tracking_status: state, tracking_label: res.label || null, tracking_checked_at: now }).in('id', ids).neq('status', 'ready');
	}
	return { checked: true, state, label: res.label, changed };
}
