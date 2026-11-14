import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { syncParcel } from '$lib/delivery/tracking-sync';
import { isTrackingConfigured } from '$lib/delivery/laposte-suivi';
import type { RequestHandler } from './$types';

/**
 * Lancé chaque jour par Vercel (voir vercel.json) :
 * vérifie le suivi La Poste de tous les colis « Expédiée ».
 */
export const GET: RequestHandler = async ({ request }) => {
	const secret = (env.CRON_SECRET || '').trim();
	const auth = request.headers.get('authorization') || '';
	const ua = request.headers.get('user-agent') || '';
	if (secret ? auth !== `Bearer ${secret}` : !ua.includes('vercel-cron')) throw error(401, 'Non autorisé');
	if (!isTrackingConfigured()) return json({ ok: false, reason: 'LAPOSTE_OKAPI_KEY manquante' });

	const admin = createClient(PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_ROLE ?? '', { auth: { persistSession: false } });
	const { data: rows, error: e } = await admin
		.from('orders')
		.select('id, tracking_number')
		.eq('status', 'ready')
		.not('tracking_number', 'is', null)
		.not('shipping_relay', 'is', null)
		.limit(200);
	if (e) return json({ ok: false, error: e.message });

	const seen = new Set<string>();
	const results: Array<{ id: string; state?: string; error?: string }> = [];
	for (const r of rows || []) {
		if (seen.has(r.tracking_number)) continue;
		seen.add(r.tracking_number);
		const res = await syncParcel(admin, r.id);
		results.push({ id: r.id, state: res.state, error: res.error });
	}
	return json({ ok: true, checked: results.length, results });
};
