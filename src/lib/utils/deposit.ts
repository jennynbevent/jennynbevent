/**
 * Acompte (paiement en 2 fois)
 *
 * Par défaut, le client paie le TOTAL à la commande.
 * Un acompte n'est demandé que si l'article a un pourcentage strictement
 * compris entre 1 et 99 % (réglage « Demander un acompte » dans l'espace admin).
 * 0 %, 100 % ou vide = paiement du total.
 */
export function hasDeposit(percentage: number | null | undefined): boolean {
	if (percentage === null || percentage === undefined) return false;
	const n = Number(percentage);
	return Number.isFinite(n) && n > 0 && n < 100;
}

/** Montant à payer à la commande (total ou acompte) */
export function amountDueNow(total: number, percentage: number | null | undefined): number {
	const t = Number(total) || 0;
	if (!hasDeposit(percentage)) return t;
	return Math.round(t * Number(percentage)) / 100;
}

/** Vrai s'il reste un solde à payer (acompte déjà versé) */
export function hasRemaining(total: number | null | undefined, paid: number | null | undefined): boolean {
	const t = Number(total) || 0;
	const p = paid === null || paid === undefined ? t : Number(paid) || 0;
	return p > 0 && t - p > 0.009;
}
