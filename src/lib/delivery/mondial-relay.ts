import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Suivi automatique des colis Mondial Relay (web service WSI2_TracingColisDetaille).
 * Clés à mettre dans Vercel : MR_ENSEIGNE (code enseigne, ex. CC12ABCD) et MR_PRIVATE_KEY (clé privée).
 * Elles se trouvent dans ton espace Mondial Relay Connect → Paramétrage → API.
 */

export type TrackingState = 'in_transit' | 'available' | 'delivered' | 'anomaly' | 'unknown';

export type TrackingResult = {
	ok: boolean;
	state: TrackingState;
	label: string; // dernier événement, en clair
	events: Array<{ label: string; date: string; place: string }>;
	error?: string;
};

const ENDPOINT = 'https://api.mondialrelay.com/Web_Services.asmx';

export function mrCredentials(): { enseigne: string; key: string } | null {
	const enseigne = (env.MR_ENSEIGNE || '').trim().toUpperCase();
	const key = (env.MR_PRIVATE_KEY || '').trim();
	if (!enseigne || !key) return null;
	return { enseigne, key };
}

export function isTrackingConfigured(): boolean {
	return mrCredentials() !== null;
}

function xmlEscape(s: string): string {
	return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string);
}

function tag(xml: string, name: string): string {
	const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
	return m ? m[1].trim() : '';
}

/** Déduit l'étape du colis à partir des libellés Mondial Relay */
export function stateFromLabels(stat: number, labels: string[]): TrackingState {
	const all = labels.map((l) => l.toLowerCase());
	// Retiré par le client
	if (all.some((l) => /(remis|livr[ée]*) (au|à) (destinataire|client)|retir[ée]|récupér[ée]|recuper[ée]|picked up|collected|delivered to (the )?(recipient|customer)/.test(l))) {
		return 'delivered';
	}
	// Arrivé au Point Relais
	if (all.some((l) => /disponible|point relais|relais|available|pick ?up point/.test(l) && /disponible|livr|arriv|available|delivery/.test(l))) {
		return 'available';
	}
	if (stat === 83) return 'anomaly';
	if (stat === 80 || stat === 81 || all.length) return 'in_transit';
	return 'unknown';
}

export async function trackParcel(tracking: string): Promise<TrackingResult> {
	const creds = mrCredentials();
	const empty = { state: 'unknown' as TrackingState, label: '', events: [] };
	if (!creds) return { ok: false, ...empty, error: 'not_configured' };
	const exp = tracking.replace(/\D/g, '').slice(0, 8);
	if (exp.length < 8) return { ok: false, ...empty, error: 'Numéro de suivi Mondial Relay attendu : 8 chiffres.' };

	const langue = 'FR';
	const security = createHash('md5').update(`${creds.enseigne}${exp}${langue}${creds.key}`).digest('hex').toUpperCase();
	const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetaille xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${xmlEscape(creds.enseigne)}</Enseigne>
      <Expedition>${exp}</Expedition>
      <Langue>${langue}</Langue>
      <Security>${security}</Security>
    </WSI2_TracingColisDetaille>
  </soap:Body>
</soap:Envelope>`;

	try {
		const res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				SOAPAction: '"http://www.mondialrelay.fr/webservice/WSI2_TracingColisDetaille"',
			},
			body,
			signal: AbortSignal.timeout(10000),
		});
		const xml = await res.text();
		if (!res.ok) return { ok: false, ...empty, error: `Mondial Relay HTTP ${res.status}` };

		const stat = Number(tag(xml, 'STAT'));
		const events = Array.from(xml.matchAll(/<ret_WSI2_sub_TracingColisDetaille>([\s\S]*?)<\/ret_WSI2_sub_TracingColisDetaille>/g))
			.map((m) => ({
				label: tag(m[1], 'Libelle'),
				date: [tag(m[1], 'Date'), tag(m[1], 'Heure')].filter(Boolean).join(' '),
				place: tag(m[1], 'Emplacement'),
			}))
			.filter((e) => e.label);
		const libelle01 = tag(xml, 'Libelle01');

		// 80 à 83 = réponses normales ; autres codes = erreur (clé, numéro inconnu…)
		if (!(stat >= 80 && stat <= 83)) {
			return { ok: false, ...empty, error: `Mondial Relay : code ${stat || 'inconnu'}` };
		}
		const labels = [...events.map((e) => e.label), libelle01].filter(Boolean);
		const state = stateFromLabels(stat, labels);
		const last = events[events.length - 1]?.label || libelle01 || '';
		return { ok: true, state, label: last, events };
	} catch (e) {
		console.error('[Mondial Relay] suivi:', e);
		return { ok: false, ...empty, error: 'Mondial Relay ne répond pas.' };
	}
}
