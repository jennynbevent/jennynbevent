/**
 * Mode de remise d'une commande (retrait ou envoi par e-mail)
 * et adresse de retrait de la boutique.
 */
export const PICKUP_ADDRESS = "5 Grand Rue de l'Hautil, 78570 Andrésy";
export const PICKUP_MAPS_URL =
	'https://www.google.com/maps/search/?api=1&query=' +
	encodeURIComponent("5 Grand Rue de l'Hautil 78570 Andrésy");

export type DeliveryMode = 'retrait' | 'email' | null;

function readValue(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'object') {
		const o = v as Record<string, unknown>;
		return String(o.value ?? o.label ?? '');
	}
	return String(v);
}

/** Lit le mode de remise choisi par le client (champ « Mode de remise ») */
export function getDeliveryMode(customizationData: unknown): DeliveryMode {
	if (!customizationData || typeof customizationData !== 'object') return null;
	const raw = readValue((customizationData as Record<string, unknown>)['Mode de remise']);
	if (!raw) return null;
	if (/mail/i.test(raw)) return 'email';
	if (/retrait/i.test(raw)) return 'retrait';
	return null;
}

/**
 * QR code envoyé par le client : uniquement pour les articles avec choix du mode de remise
 * (pour les demandes sur mesure, ces images sont des photos d'inspiration).
 */
export function getCustomerQrCode(customizationData: unknown, photos: unknown): string | null {
	if (!getDeliveryMode(customizationData)) return null;
	if (!Array.isArray(photos) || photos.length === 0) return null;
	return typeof photos[0] === 'string' ? photos[0] : null;
}
