/**
 * Livraison Colissimo (La Poste) : à domicile ou en point retrait La Poste.
 * Réglages de la boutique, tailles de colis et calcul des frais de port.
 * Les étiquettes sont créées à la main sur La Poste Pro Expéditions.
 * Utilisable côté client comme côté serveur.
 */

export type ParcelSize = 'small' | 'medium' | 'large' | 'pickup_only';

export type DeliverySettings = {
	enabled: boolean;
	prices: { small: number; medium: number; large: number };
	freeFrom: number | null; // livraison offerte à partir de ce montant d'articles (null = jamais)
	pointRetrait: boolean; // proposer aussi le point retrait La Poste (petits et moyens colis)
	prepDays: number; // jours de préparation avant l'envoi
};

export const DELIVERY_DEFAULTS: DeliverySettings = {
	enabled: false,
	prices: { small: 5.9, medium: 8.9, large: 14.9 },
	freeFrom: 120,
	pointRetrait: true,
	prepDays: 3,
};

export const PARCEL_SIZES: Array<{ id: ParcelSize; label: string; hint: string }> = [
	{ id: 'small', label: 'Petit colis', hint: 'Faire-part, stickers, papeterie (enveloppe cartonnée)' },
	{ id: 'medium', label: 'Moyen colis', hint: 'Tasse, panneau A4/A3, petits objets (L+l+h ≤ 150 cm, longueur ≤ 100 cm)' },
	{ id: 'large', label: 'Grand colis', hint: 'Grands panneaux (150 à 200 cm au total) : domicile uniquement, supplément La Poste' },
	{ id: 'pickup_only', label: 'Retrait uniquement', hint: 'Trop grand ou fragile : jamais envoyé, retrait à Andrésy' },
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
		pointRetrait: r.pointRetrait !== false,
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

/** Où envoyer le colis : à domicile, ou dans un point retrait La Poste choisi par le client */
export type ShipAddress = {
	kind: 'home' | 'point';
	name: string; // destinataire (domicile) ou nom du point retrait
	address: string;
	address2: string; // complément (bâtiment, étage…)
	zip: string;
	city: string;
	country: string;
	id?: string; // ancien format (Mondial Relay)
};
/** @deprecated ancien nom */
export type RelayPoint = ShipAddress;

/** Le point retrait est possible pour les petits et moyens colis seulement */
export function pointAllowed(settings: DeliverySettings, size: string | null): boolean {
	return settings.pointRetrait && (size === 'small' || size === 'medium');
}

/** Valide une adresse reçue du navigateur */
export function readShipAddress(raw: unknown): ShipAddress | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	const s = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
	const a: ShipAddress = {
		kind: r.kind === 'point' ? 'point' : 'home',
		name: s(r.name, 120),
		address: s(r.address, 160),
		address2: s(r.address2, 120),
		zip: s(r.zip, 5),
		city: s(r.city, 80),
		country: 'FR',
	};
	if (!a.address || a.address.length < 4 || !/^\d{5}$/.test(a.zip) || a.city.length < 2) return null;
	if (a.kind === 'point' && a.name.length < 2) return null;
	return a;
}

export const REMISE_DOMICILE = 'Livraison à domicile (Colissimo)';
export const REMISE_POINT = 'Point retrait La Poste (Colissimo)';
/** @deprecated */
export const REMISE_RELAIS = REMISE_DOMICILE;

export function shipLabel(a: { kind?: string } | null | undefined): string {
	return a?.kind === 'point' ? 'Point retrait La Poste' : 'Livraison à domicile';
}

/** Page de suivi La Poste */
export function trackingUrl(tracking: string | null | undefined, _zip?: string | null): string | null {
	if (!tracking) return null;
	return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(tracking)}`;
}

/** Trouver un bureau de poste ou un relais Pickup */
export const LAPOSTE_LOCATOR_URL = 'https://localiser.laposte.fr/';
