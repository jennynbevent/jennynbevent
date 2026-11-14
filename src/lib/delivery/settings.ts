/**
 * Livraison en Point Relais (Mondial Relay) : réglages de la boutique,
 * tailles de colis et calcul des frais de port.
 * Utilisable côté client comme côté serveur.
 */

export type ParcelSize = 'small' | 'medium' | 'large' | 'pickup_only';

export type DeliverySettings = {
	enabled: boolean;
	prices: { small: number; medium: number; large: number };
	freeFrom: number | null; // livraison offerte à partir de ce montant d'articles (null = jamais)
	brand: string; // code enseigne Mondial Relay pour la carte des Points Relais
	prepDays: number; // jours de préparation avant l'envoi
};

export const DELIVERY_DEFAULTS: DeliverySettings = {
	enabled: false,
	prices: { small: 4.9, medium: 6.9, large: 9.9 },
	freeFrom: 120,
	brand: '',
	prepDays: 3,
};

/** Code public de test Mondial Relay (affiche la vraie carte des Points Relais) */
export const MR_TEST_BRAND = 'BDTEST  ';

export const PARCEL_SIZES: Array<{ id: ParcelSize; label: string; hint: string }> = [
	{ id: 'small', label: 'Petit colis', hint: 'Enveloppe cartonnée : faire-part, stickers, papeterie (jusqu’à 1 kg)' },
	{ id: 'medium', label: 'Moyen colis', hint: 'Boîte : tasse, petits objets, panneau A4 (jusqu’à 3 kg)' },
	{ id: 'large', label: 'Grand colis', hint: 'Grand carton : panneau A3, gros lots (jusqu’à 10 kg)' },
	{ id: 'pickup_only', label: 'Retrait uniquement', hint: 'Trop grand ou fragile : jamais envoyé (ex. panneau 60×80)' },
];

const ORDER: Record<string, number> = { small: 1, medium: 2, large: 3 };

export function parcelLabel(size: string | null | undefined): string {
	return PARCEL_SIZES.find((p) => p.id === size)?.label || 'Moyen colis';
}

export function normalizeParcelSize(v: unknown): ParcelSize {
	return v === 'small' || v === 'medium' || v === 'large' || v === 'pickup_only' ? v : 'medium';
}

function num(v: unknown, fallback: number): number {
	const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
	return Number.isFinite(n) && n >= 0 && n < 1000 ? Math.round(n * 100) / 100 : fallback;
}

/** Lit les réglages enregistrés (avec valeurs par défaut) */
export function readDeliverySettings(raw: unknown): DeliverySettings {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
	const p = (r.prices && typeof r.prices === 'object' ? r.prices : {}) as Record<string, unknown>;
	const free = r.freeFrom === null || r.freeFrom === '' ? null : num(r.freeFrom, DELIVERY_DEFAULTS.freeFrom ?? 0);
	return {
		enabled: r.enabled === true,
		prices: {
			small: num(p.small, DELIVERY_DEFAULTS.prices.small),
			medium: num(p.medium, DELIVERY_DEFAULTS.prices.medium),
			large: num(p.large, DELIVERY_DEFAULTS.prices.large),
		},
		freeFrom: r.freeFrom === undefined ? DELIVERY_DEFAULTS.freeFrom : free,
		brand: typeof r.brand === 'string' ? r.brand.trim().toUpperCase().slice(0, 10) : '',
		prepDays: Math.min(30, Math.max(0, Math.round(num(r.prepDays, DELIVERY_DEFAULTS.prepDays)))),
	};
}

/**
 * Taille du colis pour un ensemble d'articles imprimés :
 * la plus grande taille l'emporte. null si un article est « retrait uniquement ».
 */
export function cartParcelSize(sizes: Array<string | null | undefined>): Exclude<ParcelSize, 'pickup_only'> | null {
	let best: Exclude<ParcelSize, 'pickup_only'> = 'small';
	for (const s of sizes) {
		const n = normalizeParcelSize(s);
		if (n === 'pickup_only') return null;
		if (ORDER[n] > ORDER[best]) best = n;
	}
	return best;
}

/** Frais de port à payer (0 si la livraison est offerte) */
export function shippingFee(settings: DeliverySettings, size: Exclude<ParcelSize, 'pickup_only'>, itemsTotal: number): number {
	if (settings.freeFrom !== null && itemsTotal >= settings.freeFrom) return 0;
	return settings.prices[size];
}

/** Ce qu'il manque pour avoir la livraison offerte */
export function missingForFree(settings: DeliverySettings, itemsTotal: number): number | null {
	if (settings.freeFrom === null) return null;
	return Math.max(0, Math.round((settings.freeFrom - itemsTotal) * 100) / 100);
}

export type RelayPoint = {
	id: string;
	name: string;
	address: string;
	zip: string;
	city: string;
	country: string;
};

/** Valide un Point Relais reçu du navigateur */
export function readRelay(raw: unknown): RelayPoint | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
	const relay = {
		id: s(r.id, 20),
		name: s(r.name, 120),
		address: s(r.address, 200),
		zip: s(r.zip, 10),
		city: s(r.city, 80),
		country: s(r.country, 2).toUpperCase() || 'FR',
	};
	if (!/^[0-9A-Za-z-]{2,20}$/.test(relay.id) || !relay.name || !relay.zip || !relay.city) return null;
	return relay;
}

export const REMISE_RELAIS = 'Livraison en Point Relais';

export function trackingUrl(tracking: string | null | undefined, zip?: string | null): string | null {
	if (!tracking) return null;
	const cp = zip ? `&codePostal=${encodeURIComponent(zip)}` : '';
	return `https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${encodeURIComponent(tracking)}${cp}`;
}
