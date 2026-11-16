/** Disponibilité d'un article en boutique (sans le cacher) */
export type Availability = 'available' | 'soon' | 'unavailable';

export const AVAILABILITY_OPTIONS: Array<{ id: Availability; label: string; hint: string }> = [
	{ id: 'available', label: '✅ Disponible', hint: 'Le client peut commander' },
	{ id: 'soon', label: '⏳ Bientôt de retour', hint: 'Visible mais grisé, commande impossible' },
	{ id: 'unavailable', label: '⛔ Indisponible', hint: 'Visible mais grisé, commande impossible' },
];

export function normalizeAvailability(v: unknown): Availability {
	return v === 'soon' || v === 'unavailable' ? v : 'available';
}

/** Texte de l'étiquette affichée au client (null si disponible) */
export function availabilityBadge(v: unknown): string | null {
	const a = normalizeAvailability(v);
	if (a === 'soon') return '⏳ Bientôt de retour';
	if (a === 'unavailable') return 'Indisponible';
	return null;
}
