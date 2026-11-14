import { env } from '$env/dynamic/private';

/**
 * Suivi automatique des colis La Poste / Colissimo (API « Suivi v2 », gratuite).
 * Clé à mettre dans Vercel : LAPOSTE_OKAPI_KEY
 * (créée sur developer.laposte.fr → API Suivi v2 → s'abonner, offre gratuite).
 */

export type TrackingState = 'in_transit' | 'out_for_delivery' | 'available' | 'delivered' | 'anomaly' | 'unknown';

export type TrackingResult = {
	ok: boolean;
	state: TrackingState;
	label: string; // dernier événement, en clair
	events: Array<{ code: string; label: string; date: string }>;
	error?: string;
};

const ENDPOINT = 'https://api.laposte.fr/suivi/v2/idships/';

function apiKey(): string {
	return (env.LAPOSTE_OKAPI_KEY || '').trim();
}

export function isTrackingConfigured(): boolean {
	return !!apiKey();
}

/** Codes d'événements La Poste → étape du colis */
export function stateFromEvents(codes: string[]): TrackingState {
	const has = (re: RegExp) => codes.some((c) => re.test(c));
	if (has(/^DI1$/)) return 'delivered'; // distribué (ou retiré au point retrait)
	if (has(/^(RE1|DI2)$/)) return 'anomaly'; // retourné à l'expéditeur
	if (has(/^AG1$/)) return 'available'; // disponible au bureau de poste / point retrait
	if (has(/^MD2$/)) return 'out_for_delivery'; // en cours de livraison
	if (has(/^(PB\d|ND1)$/)) return 'anomaly';
	if (codes.length) return 'in_transit';
	return 'unknown';
}

export async function trackParcel(tracking: string): Promise<TrackingResult> {
	const empty = { state: 'unknown' as TrackingState, label: '', events: [] };
	const key = apiKey();
	if (!key) return { ok: false, ...empty, error: 'not_configured' };
	const id = tracking.replace(/\s+/g, '').toUpperCase();
	if (!/^[0-9A-Z]{11,15}$/.test(id)) return { ok: false, ...empty, error: 'Numéro de suivi La Poste invalide.' };

	try {
		const res = await fetch(`${ENDPOINT}${encodeURIComponent(id)}?lang=fr_FR`, {
			headers: { Accept: 'application/json', 'X-Okapi-Key': key },
			signal: AbortSignal.timeout(10000),
		});
		if (res.status === 404) return { ok: false, ...empty, error: 'La Poste ne connaît pas encore ce numéro (normal juste après le dépôt).' };
		if (res.status === 401 || res.status === 403) return { ok: false, ...empty, error: 'Clé La Poste refusée (vérifier LAPOSTE_OKAPI_KEY dans Vercel).' };
		if (!res.ok) return { ok: false, ...empty, error: `La Poste : erreur ${res.status}` };
		const data = await res.json();
		const raw = (data?.shipment?.event || []) as Array<{ code?: string; label?: string; date?: string }>;
		// La Poste renvoie les événements du plus récent au plus ancien
		const events = raw
			.map((e) => ({ code: String(e.code || ''), label: String(e.label || ''), date: String(e.date || '') }))
			.sort((a, b) => a.date.localeCompare(b.date));
		const state = stateFromEvents(events.map((e) => e.code));
		const last = events[events.length - 1]?.label || '';
		return { ok: true, state, label: last, events };
	} catch (e) {
		console.error('[La Poste] suivi:', e);
		return { ok: false, ...empty, error: 'La Poste ne répond pas.' };
	}
}
