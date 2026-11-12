import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

/**
 * Notifications sur l'iPad / le téléphone / l'ordinateur où l'espace boutique
 * est installé comme application (Web Push).
 * Clés à mettre dans Vercel : PUBLIC_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY.
 */
export function pushPublicKey(): string {
	return (publicEnv.PUBLIC_VAPID_PUBLIC_KEY || '').trim();
}

function configured(): boolean {
	const pub = pushPublicKey();
	const priv = (env.VAPID_PRIVATE_KEY || '').trim();
	if (!pub || !priv) return false;
	webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:contact@jennynbevent.com', pub, priv);
	return true;
}

export function isPushConfigured(): boolean {
	return !!pushPublicKey() && !!(env.VAPID_PRIVATE_KEY || '').trim();
}

function admin() {
	return createClient(PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_ROLE ?? '', {
		auth: { persistSession: false },
	});
}

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Envoie une notification à tous les appareils enregistrés. Ne lève jamais d'erreur. */
export async function sendPushToAll(message: PushMessage): Promise<number> {
	try {
		if (!configured()) return 0;
		const db = admin();
		const { data: subs, error } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth');
		if (error || !subs?.length) return 0;
		const payload = JSON.stringify(message);
		let sent = 0;
		await Promise.all(
			subs.map(async (s: any) => {
				try {
					await webpush.sendNotification(
						{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
						payload,
						{ TTL: 60 * 60 * 24, urgency: 'high' }
					);
					sent++;
				} catch (err: any) {
					// Appareil désinstallé ou autorisation retirée : on l'oublie
					if (err?.statusCode === 404 || err?.statusCode === 410) {
						await db.from('push_subscriptions').delete().eq('id', s.id);
					} else {
						console.error('[push] envoi impossible:', err?.statusCode, err?.body || err?.message);
					}
				}
			})
		);
		return sent;
	} catch (e) {
		console.error('[push] erreur:', e);
		return 0;
	}
}

export async function saveSubscription(
	sub: { endpoint: string; keys: { p256dh: string; auth: string } },
	userAgent: string
) {
	return admin()
		.from('push_subscriptions')
		.upsert(
			{ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent.slice(0, 300) },
			{ onConflict: 'endpoint' }
		);
}

export async function deleteSubscription(endpoint: string) {
	return admin().from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/** 25 → « 25,00 € » */
export function euros(n: number | null | undefined): string {
	if (n == null || isNaN(Number(n))) return '';
	return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n));
}

/** Garde seulement le chemin d'une adresse du site (pour ouvrir la bonne page) */
export function pathOf(url: string | undefined): string {
	if (!url) return '/dashboard/orders';
	try {
		return new URL(url, 'https://x.invalid').pathname || '/dashboard/orders';
	} catch {
		return '/dashboard/orders';
	}
}
